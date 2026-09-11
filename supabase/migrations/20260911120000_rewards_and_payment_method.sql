-- =====================================================================
-- GuestOS — premi riscattati e metodo di pagamento delle prenotazioni
-- =====================================================================
-- 1. `get_my_rewards`: la pagina premi mostra i codici riscattati
--    dall'ospite. Era l'unica funzione del contratto client ancora
--    mancante: senza di essa la sezione "I miei premi" resta vuota.
-- 2. `create_booking` accetta il payload che il client invia davvero:
--    `item_name` (nome mostrato a schermo), `unit_price` (prezzo unitario,
--    usato solo dove non esiste catalogo) e `payment_method`.
--    Il prezzo resta deciso dal server ovunque ci sia un catalogo.
-- 3. `payment_method` viene registrato sulle tre tabelle di prenotazione:
--    prima non c'era una colonna dove metterlo e l'informazione andava persa.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Colonna payment_method
-- ---------------------------------------------------------------------
alter table public.restaurant_bookings add column if not exists payment_method text;
alter table public.spa_bookings        add column if not exists payment_method text;
alter table public.tour_bookings       add column if not exists payment_method text;

alter table public.restaurant_bookings drop constraint if exists restaurant_bookings_payment_method_check;
alter table public.restaurant_bookings add constraint restaurant_bookings_payment_method_check
    check (payment_method is null or payment_method in ('points', 'card', 'room'));
alter table public.spa_bookings drop constraint if exists spa_bookings_payment_method_check;
alter table public.spa_bookings add constraint spa_bookings_payment_method_check
    check (payment_method is null or payment_method in ('points', 'card', 'room'));
alter table public.tour_bookings drop constraint if exists tour_bookings_payment_method_check;
alter table public.tour_bookings add constraint tour_bookings_payment_method_check
    check (payment_method is null or payment_method in ('points', 'card', 'room'));

-- spa_bookings non aveva payment_status: le altre due sì, e la dashboard
-- deve poter leggere lo stesso campo su tutte e tre.
alter table public.spa_bookings add column if not exists payment_status text;

-- ---------------------------------------------------------------------
-- 2. get_my_rewards
-- ---------------------------------------------------------------------
drop function if exists public.get_my_rewards(text);
create function public.get_my_rewards(p_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text;
begin
    v_id := public.guestos_require_guest(p_token);
    select email into v_email from public.users where id = v_id;

    return coalesce((select json_agg(t order by t.redeemed_at desc nulls last) from (
        select ur.id,
               ur.code,
               ur.status,
               ur.redeemed_at,
               ur.used_at,
               ur.reward_id,
               coalesce(r.name, 'Premio') as reward,
               r.description,
               r.emoji,
               r.points_required,
               r.value_euros,
               r.category
          from public.user_rewards ur
          left join public.rewards r on r.id = ur.reward_id
         where ur.user_email = v_email) t), '[]'::json);
end $$;

-- ---------------------------------------------------------------------
-- 3. create_booking con item_name / unit_price / payment_method
-- ---------------------------------------------------------------------
-- Payload accettato:
--   booking_date | tour_date   (obbligatorio, non nel passato)
--   booking_time, num_people, notes, meal_type, user_phone, duration_minutes
--   treatment_id (spa), tour_id (tour)
--   item_name      nome mostrato dal client; se manca lo prende dal catalogo
--   unit_price     prezzo unitario; considerato SOLO per il ristorante, che
--                  non ha un catalogo di prezzi. Per spa e tour il prezzo
--                  arriva sempre da spa_treatments / tours.
--   payment_method 'points' | 'card' | 'room' (default 'room')
--   points_used    punti da scalare; con payment_method='points' il server
--                  calcola da sé i punti necessari a coprire tutto.
create or replace function public.create_booking(p_kind text, p_payload jsonb, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_id integer; v_email text; v_name text; v_room text;
    v_kind text := lower(trim(coalesce(p_kind, '')));
    v_method text := lower(trim(coalesce(nullif(p_payload->>'payment_method', ''), 'room')));
    v_date date; v_time time; v_people integer; v_notes text;
    v_points integer; v_discount numeric; v_original numeric; v_final numeric;
    v_treatment integer; v_tour bigint; v_unit numeric;
    v_item_name text; v_catalog_name text; v_duration integer;
    v_pay_status text; v_booking_id bigint;
begin
    v_id := public.guestos_require_guest(p_token);
    select u.email, u.last_name, u.room_number into v_email, v_name, v_room
      from public.users u where u.id = v_id;

    if v_kind not in ('restaurant', 'spa', 'tour') then
        raise exception 'INVALID_INPUT: tipo prenotazione non valido';
    end if;
    if v_method not in ('points', 'card', 'room') then
        raise exception 'INVALID_INPUT: metodo di pagamento non valido';
    end if;

    v_date := coalesce(nullif(p_payload->>'booking_date', '')::date,
                       nullif(p_payload->>'tour_date', '')::date);
    if v_date is null or v_date < current_date then raise exception 'INVALID_DATE'; end if;

    v_time   := coalesce(nullif(p_payload->>'booking_time', '')::time, '10:00'::time);
    v_people := greatest(1, coalesce(nullif(p_payload->>'num_people', '')::integer, 1));
    v_notes  := nullif(p_payload->>'notes', '');
    v_points := greatest(0, coalesce(nullif(p_payload->>'points_used', '')::integer, 0));
    v_item_name := coalesce(nullif(p_payload->>'item_name', ''),
                            nullif(p_payload->>'treatment_name', ''),
                            nullif(p_payload->>'tour_name', ''));

    if v_kind = 'restaurant' then
        -- nessun catalogo di prezzi per il ristorante: il totale arriva dal
        -- client, come prima, con unit_price come alternativa per persona.
        v_original := coalesce(nullif(p_payload->>'original_price', '')::numeric,
                               nullif(p_payload->>'unit_price', '')::numeric * v_people,
                               0);

    elsif v_kind = 'spa' then
        v_treatment := nullif(p_payload->>'treatment_id', '')::integer;
        if v_treatment is null then raise exception 'INVALID_INPUT: trattamento mancante'; end if;
        select t.price, t.name, t.duration_minutes into v_unit, v_catalog_name, v_duration
          from public.spa_treatments t where t.id = v_treatment;
        if v_unit is null then raise exception 'NOT_FOUND: trattamento non disponibile'; end if;
        v_original := v_unit * v_people;

    else
        v_tour := nullif(p_payload->>'tour_id', '')::bigint;
        if v_tour is null then raise exception 'INVALID_INPUT: escursione mancante'; end if;
        select t.price, t.name into v_unit, v_catalog_name
          from public.tours t where t.id = v_tour and coalesce(t.active, true) = true;
        if v_unit is null then raise exception 'NOT_FOUND: escursione non disponibile'; end if;
        v_original := v_unit * v_people;
    end if;

    v_original := round(coalesce(v_original, 0), 2);
    v_item_name := coalesce(v_item_name, v_catalog_name);

    -- Pagamento interamente in punti: i punti li calcola il server sul
    -- prezzo di catalogo, non li accetta dal client.
    if v_method = 'points' then
        v_points := ceil(v_original * 10)::integer;
    end if;

    -- 10 punti = 1 euro, e lo sconto non può superare il totale
    v_discount := least(round(v_points / 10.0, 2), v_original);
    v_points   := (v_discount * 10)::integer;
    v_final    := greatest(0, v_original - v_discount);

    if v_method = 'points' and v_final > 0 then
        raise exception 'INSUFFICIENT_POINTS';
    end if;

    if v_points > 0 then perform public.guestos_spend_points(v_email, v_points, 'booking', null); end if;

    -- Saldato subito se non resta nulla da pagare; altrimenti in attesa
    -- (la carta la conferma il webhook Stripe, la camera il checkout).
    v_pay_status := case when v_final = 0 then 'paid' else 'pending' end;

    if v_kind = 'restaurant' then
        insert into public.restaurant_bookings (
            user_email, user_name, room_number, booking_date, booking_time, num_people,
            original_price, points_used, discount_amount, final_price, status, notes, meal_type,
            payment_method, payment_status)
        values (v_email, v_name, v_room, v_date, v_time, v_people,
            v_original, v_points, v_discount, v_final, 'pending', v_notes,
            nullif(p_payload->>'meal_type', ''), v_method, v_pay_status)
        returning id into v_booking_id;

    elsif v_kind = 'spa' then
        insert into public.spa_bookings (
            user_email, user_name, treatment_id, treatment_name, booking_date, booking_time,
            duration_minutes, num_people, price, original_price, points_used, discount_amount,
            final_price, status, notes, payment_method, payment_status)
        values (v_email, v_name, v_treatment, v_item_name, v_date, v_time,
            coalesce(nullif(p_payload->>'duration_minutes', '')::integer, v_duration), v_people,
            v_final, v_original, v_points, v_discount, v_final, 'pending', v_notes,
            v_method, v_pay_status)
        returning id into v_booking_id;

    else
        insert into public.tour_bookings (
            user_email, user_name, user_phone, tour_id, tour_name, booking_date, tour_date,
            num_people, total_price, original_price, points_used, discount_amount, final_price,
            status, payment_status, notes, payment_method)
        values (v_email, v_name, nullif(p_payload->>'user_phone', ''), v_tour,
            v_item_name, v_date, v_date, v_people,
            v_final, v_original, v_points, v_discount, v_final, 'pending', v_pay_status, v_notes,
            v_method)
        returning id into v_booking_id;
    end if;

    update public.user_points
       set total_bookings = coalesce(total_bookings, 0) + 1, updated_at = now()
     where user_email = v_email;

    return json_build_object('id', v_booking_id, 'kind', v_kind, 'item_name', v_item_name,
                            'original_price', v_original, 'final_price', v_final,
                            'points_used', v_points, 'payment_method', v_method,
                            'payment_status', v_pay_status);
end $$;

-- ---------------------------------------------------------------------
-- 4. get_my_bookings espone metodo e stato del pagamento
-- ---------------------------------------------------------------------
create or replace function public.get_my_bookings(p_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text;
begin
    v_id := public.guestos_require_guest(p_token);
    select email into v_email from public.users where id = v_id;

    return json_build_object(
        'restaurant', coalesce((select json_agg(t order by t.booking_date desc) from (
            select id, booking_date, booking_time, num_people, status, final_price, notes,
                   payment_method, payment_status
              from public.restaurant_bookings where user_email = v_email) t), '[]'::json),
        'spa', coalesce((select json_agg(t order by t.booking_date desc) from (
            select id, booking_date, booking_time, treatment_name, num_people, status, final_price,
                   notes, payment_method, payment_status
              from public.spa_bookings where user_email = v_email) t), '[]'::json),
        'tour', coalesce((select json_agg(t order by t.booking_date desc) from (
            select id, booking_date, tour_name, num_people, status, final_price, notes,
                   payment_method, payment_status
              from public.tour_bookings where user_email = v_email) t), '[]'::json));
end $$;

-- ---------------------------------------------------------------------
-- 5. Privilegi
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
    for r in
        select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('get_my_rewards', 'create_booking', 'get_my_bookings')
    loop
        execute format('revoke all on function %s from public, anon, authenticated', r.sig);
        execute format('grant execute on function %s to anon, authenticated', r.sig);
    end loop;
end $$;

commit;

notify pgrst, 'reload schema';
