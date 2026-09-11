-- =====================================================================
-- GuestOS — correzioni emerse dal collaudo delle RPC
-- =====================================================================
-- 1. Il catalogo spa usato dalle prenotazioni è `spa_treatments` (id intero),
--    non `spa_services` (id uuid): il join sbagliato faceva fallire
--    create_booking con "operator does not exist: uuid = bigint".
-- 2. create_booking accettava un id di catalogo inesistente e falliva più
--    tardi con un errore di chiave esterna illeggibile per l'utente.
-- 3. update_profile non poteva cambiare l'email: due chiavi esterne puntano
--    a users.email senza ON UPDATE CASCADE.
-- 4. save_push_subscription passava NULL su colonne NOT NULL.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Le prenotazioni seguono l'email dell'ospite se questa cambia
-- ---------------------------------------------------------------------
alter table public.restaurant_bookings drop constraint if exists restaurant_bookings_user_email_fkey;
alter table public.restaurant_bookings add constraint restaurant_bookings_user_email_fkey
    foreign key (user_email) references public.users(email) on update cascade;

alter table public.spa_bookings drop constraint if exists spa_bookings_user_email_fkey;
alter table public.spa_bookings add constraint spa_bookings_user_email_fkey
    foreign key (user_email) references public.users(email) on update cascade;

-- ---------------------------------------------------------------------
-- 2. create_booking: catalogo corretto e validazione degli id
-- ---------------------------------------------------------------------
create or replace function public.create_booking(p_kind text, p_payload jsonb, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_id integer; v_email text; v_name text; v_room text;
    v_kind text := lower(trim(coalesce(p_kind, '')));
    v_date date; v_time time; v_people integer; v_notes text;
    v_points integer; v_discount numeric; v_original numeric; v_final numeric;
    v_treatment integer; v_tour bigint; v_unit numeric;
    v_treatment_name text; v_tour_name text; v_duration integer;
    v_booking_id bigint;
begin
    v_id := public.guestos_require_guest(p_token);
    select u.email, u.last_name, u.room_number into v_email, v_name, v_room
      from public.users u where u.id = v_id;

    if v_kind not in ('restaurant', 'spa', 'tour') then
        raise exception 'INVALID_INPUT: tipo prenotazione non valido';
    end if;

    v_date := coalesce(nullif(p_payload->>'booking_date', '')::date,
                       nullif(p_payload->>'tour_date', '')::date);
    if v_date is null or v_date < current_date then raise exception 'INVALID_DATE'; end if;

    v_time   := coalesce(nullif(p_payload->>'booking_time', '')::time, '10:00'::time);
    v_people := greatest(1, coalesce(nullif(p_payload->>'num_people', '')::integer, 1));
    v_notes  := nullif(p_payload->>'notes', '');
    v_points := greatest(0, coalesce(nullif(p_payload->>'points_used', '')::integer, 0));

    if v_kind = 'restaurant' then
        v_original := coalesce(nullif(p_payload->>'original_price', '')::numeric, 0);

    elsif v_kind = 'spa' then
        -- spa_bookings.treatment_id è intero e punta a spa_treatments
        v_treatment := nullif(p_payload->>'treatment_id', '')::integer;
        if v_treatment is null then raise exception 'INVALID_INPUT: trattamento mancante'; end if;
        select t.price, t.name, t.duration_minutes into v_unit, v_treatment_name, v_duration
          from public.spa_treatments t where t.id = v_treatment;
        if v_unit is null then raise exception 'NOT_FOUND: trattamento non disponibile'; end if;
        v_original := v_unit * v_people;

    else
        v_tour := nullif(p_payload->>'tour_id', '')::bigint;
        if v_tour is null then raise exception 'INVALID_INPUT: escursione mancante'; end if;
        select t.price, t.name into v_unit, v_tour_name
          from public.tours t where t.id = v_tour and coalesce(t.active, true) = true;
        if v_unit is null then raise exception 'NOT_FOUND: escursione non disponibile'; end if;
        v_original := v_unit * v_people;
    end if;

    -- 10 punti = 1 euro, e lo sconto non può superare il totale
    v_discount := least(round(v_points / 10.0, 2), v_original);
    v_points   := (v_discount * 10)::integer;
    v_final    := greatest(0, v_original - v_discount);

    if v_points > 0 then perform public.guestos_spend_points(v_email, v_points, 'booking', null); end if;

    if v_kind = 'restaurant' then
        insert into public.restaurant_bookings (
            user_email, user_name, room_number, booking_date, booking_time, num_people,
            original_price, points_used, discount_amount, final_price, status, notes, meal_type)
        values (v_email, v_name, v_room, v_date, v_time, v_people,
            v_original, v_points, v_discount, v_final, 'pending', v_notes,
            nullif(p_payload->>'meal_type', ''))
        returning id into v_booking_id;

    elsif v_kind = 'spa' then
        insert into public.spa_bookings (
            user_email, user_name, treatment_id, treatment_name, booking_date, booking_time,
            duration_minutes, num_people, price, original_price, points_used, discount_amount,
            final_price, status, notes)
        values (v_email, v_name, v_treatment,
            coalesce(nullif(p_payload->>'treatment_name', ''), v_treatment_name), v_date, v_time,
            coalesce(nullif(p_payload->>'duration_minutes', '')::integer, v_duration), v_people,
            v_final, v_original, v_points, v_discount, v_final, 'pending', v_notes)
        returning id into v_booking_id;

    else
        insert into public.tour_bookings (
            user_email, user_name, user_phone, tour_id, tour_name, booking_date, tour_date,
            num_people, total_price, original_price, points_used, discount_amount, final_price,
            status, payment_status, notes)
        values (v_email, v_name, nullif(p_payload->>'user_phone', ''), v_tour,
            coalesce(nullif(p_payload->>'tour_name', ''), v_tour_name), v_date, v_date, v_people,
            v_final, v_original, v_points, v_discount, v_final, 'pending', 'unpaid', v_notes)
        returning id into v_booking_id;
    end if;

    update public.user_points
       set total_bookings = coalesce(total_bookings, 0) + 1, updated_at = now()
     where user_email = v_email;

    return json_build_object('id', v_booking_id, 'kind', v_kind,
                            'original_price', v_original, 'final_price', v_final,
                            'points_used', v_points);
end $$;

-- ---------------------------------------------------------------------
-- 3. save_push_subscription: p256dh e auth sono NOT NULL
-- ---------------------------------------------------------------------
create or replace function public.save_push_subscription(
    p_endpoint text, p_p256dh text default null, p_auth text default null,
    p_user_agent text default null, p_token text default null)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text;
begin
    v_id := public.guestos_require_guest(p_token);
    if coalesce(trim(p_endpoint), '') = '' then raise exception 'INVALID_INPUT'; end if;
    select email into v_email from public.users where id = v_id;

    delete from public.user_push_subscriptions where endpoint = p_endpoint;
    insert into public.user_push_subscriptions (user_email, endpoint, p256dh, auth, user_agent, last_used_at)
    values (v_email, p_endpoint, coalesce(p_p256dh, ''), coalesce(p_auth, ''), p_user_agent, now());
    return true;
end $$;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 4. admin_audit_log.target_id è NOT NULL: admin_adjust_points registrava
--    null e falliva. Si risolve l'id dell'ospite dalla sua email.
-- ---------------------------------------------------------------------
create or replace function public.admin_adjust_points(
    p_email text, p_new_points integer, p_admin_token text default null)
returns integer
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_admin text; v_total integer; v_user_id integer;
begin
    v_admin := public.guestos_require_admin(p_admin_token);
    if p_new_points is null or p_new_points < 0 then raise exception 'INVALID_INPUT'; end if;

    update public.user_points set points = p_new_points, updated_at = now()
     where user_email = p_email returning points into v_total;
    if v_total is null then raise exception 'NOT_FOUND'; end if;

    select id into v_user_id from public.users where email = p_email;

    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (v_admin, 'adjust_points', 'user_points', coalesce(v_user_id, 0),
            jsonb_build_object('email', p_email, 'new_points', p_new_points));
    return v_total;
end $$;
revoke all on function public.admin_adjust_points(text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_points(text, integer, text) to anon, authenticated;

-- hotel_settings è singleton: target_id 1 va sempre bene, ma rendiamo
-- esplicito che ogni inserimento nell'audit log ha un target valido.
