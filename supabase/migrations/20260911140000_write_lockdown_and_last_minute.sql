-- =====================================================================
-- GuestOS — chiusura delle scritture dirette e offerte last minute
-- =====================================================================
-- 1. Nessuna pagina del client scrive più direttamente sulle tabelle con
--    dati dell'ospite: tutto passa da RPC. I privilegi di scrittura per
--    `anon` e `authenticated` su quelle tabelle vengono quindi revocati.
--    Era l'ultimo punto aperto di SECURITY.md: un ospite autenticato poteva
--    ancora gonfiarsi i punti scrivendo `user_points.points` via REST.
--    Restano scrivibili dal browser solo i cataloghi, che la dashboard admin
--    modifica con select/insert dirette sotto la policy `admin_all`.
-- 2. `spa_services` non è più usata da nessuno: contiene una sola riga
--    stantia che sostituiva le card vere della pagina spa. Rinominata
--    `spa_services_legacy` e tolta dalla portata del browser, così nessuno
--    ci ricasca. Il catalogo vero è `spa_treatments`.
-- 3. `create_booking` accetta `offer_id`: le offerte last minute spa e tour
--    tornano prenotabili al prezzo scontato, con i posti che calano davvero.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Scritture dirette revocate
-- ---------------------------------------------------------------------
-- La lettura resta dov'era: a filtrare le righe sono le policy RLS.
do $$
declare
    r text;
    -- dati dell'ospite: si scrivono solo dalle RPC SECURITY DEFINER
    guest_tables text[] := array[
        'users', 'user_points', 'point_transactions', 'game_scores', 'quiz_scores',
        'challenge_completions', 'weekly_challenge_completions', 'user_rewards',
        'user_push_subscriptions', 'community_challenges',
        'restaurant_bookings', 'spa_bookings', 'tour_bookings',
        'payments', 'last_minute_purchases', 'stripe_customers',
        'ai_conversations', 'ai_messages', 'ai_actions', 'ai_feedback',
        -- solo staff: ci scrivono le RPC admin o il service_role
        'guest_staff_notes', 'admin_audit_log', 'hotels', 'bookings',
        'animation_bookings', 'lastminute_bookings', 'ai_analytics', 'photo_challenges'
    ];
begin
    foreach r in array guest_tables loop
        if to_regclass('public.' || quote_ident(r)) is not null then
            execute format('revoke insert, update, delete on table public.%I from anon, authenticated', r);
        end if;
    end loop;
end $$;

-- La policy di UPDATE dell'ospite su user_points non ha più un privilegio
-- dietro: si toglie per non lasciare in giro un permesso che non permette nulla.
drop policy if exists guest_update on public.user_points;

-- ---------------------------------------------------------------------
-- 2. spa_services fuori dai piedi
-- ---------------------------------------------------------------------
do $$
begin
    if to_regclass('public.spa_services') is not null
       and to_regclass('public.spa_services_legacy') is null then
        alter table public.spa_services rename to spa_services_legacy;
    end if;
end $$;

revoke all on table public.spa_services_legacy from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. create_booking con le offerte last minute
-- ---------------------------------------------------------------------
-- In più rispetto a prima: `offer_id`. Se c'è, il prezzo base diventa
-- `discounted_price` dell'offerta invece del listino di catalogo, il posto
-- viene sottratto da `slots_available` e l'acquisto finisce in
-- `last_minute_purchases`. L'offerta deve essere attiva, nel suo periodo di
-- validità, del tipo giusto e con un `item_id` che punta al catalogo.
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
    v_offer_id bigint; v_offer public.last_minute_offers%rowtype;
    v_list numeric; v_catalog_price numeric; v_slots integer;
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
    v_offer_id := nullif(p_payload->>'offer_id', '')::bigint;

    -- Offerta last minute: prezzo, catalogo e posti li detta l'offerta
    if v_offer_id is not null then
        select * into v_offer from public.last_minute_offers where id = v_offer_id;
        if v_offer.id is null then raise exception 'NOT_FOUND: offerta inesistente'; end if;
        if coalesce(v_offer.active, true) = false then raise exception 'OFFER_EXPIRED'; end if;
        if v_offer.valid_until <= now() then raise exception 'OFFER_EXPIRED'; end if;
        if v_offer.valid_from is not null and v_offer.valid_from > now() then
            raise exception 'OFFER_NOT_STARTED';
        end if;
        if lower(v_offer.type) <> v_kind then
            raise exception 'INVALID_INPUT: offerta non prenotabile da questa pagina';
        end if;
        if v_offer.item_id is null then
            raise exception 'OFFER_NOT_BOOKABLE: offerta senza servizio collegato';
        end if;
        -- i posti si scalano subito, con la guardia che evita l'overbooking
        if v_offer.slots_available is not null then
            update public.last_minute_offers
               set slots_available = slots_available - v_people
             where id = v_offer_id and slots_available >= v_people
            returning slots_available into v_slots;
            if v_slots is null then raise exception 'OFFER_SOLD_OUT'; end if;
        end if;
        v_unit := v_offer.discounted_price;
        v_list := v_offer.original_price;
        v_item_name := coalesce(v_item_name, v_offer.title);
    end if;

    if v_kind = 'restaurant' then
        -- nessun catalogo di prezzi per il ristorante: il totale arriva dal
        -- client, come prima, con unit_price come alternativa per persona.
        v_original := coalesce(v_unit * v_people,
                               nullif(p_payload->>'original_price', '')::numeric,
                               nullif(p_payload->>'unit_price', '')::numeric * v_people,
                               0);

    elsif v_kind = 'spa' then
        v_treatment := coalesce(v_offer.item_id::integer, nullif(p_payload->>'treatment_id', '')::integer);
        if v_treatment is null then raise exception 'INVALID_INPUT: trattamento mancante'; end if;
        select t.price, t.name, t.duration_minutes into v_catalog_price, v_catalog_name, v_duration
          from public.spa_treatments t where t.id = v_treatment;
        if v_catalog_price is null then raise exception 'NOT_FOUND: trattamento non disponibile'; end if;
        -- con un'offerta il prezzo pieno è quello dell'offerta, non del catalogo
        v_list := coalesce(v_list, v_catalog_price);
        v_unit := coalesce(v_unit, v_catalog_price);
        v_original := v_unit * v_people;

    else
        v_tour := coalesce(v_offer.item_id, nullif(p_payload->>'tour_id', '')::bigint);
        if v_tour is null then raise exception 'INVALID_INPUT: escursione mancante'; end if;
        select t.price, t.name into v_catalog_price, v_catalog_name
          from public.tours t where t.id = v_tour and coalesce(t.active, true) = true;
        if v_catalog_price is null then raise exception 'NOT_FOUND: escursione non disponibile'; end if;
        v_list := coalesce(v_list, v_catalog_price);
        v_unit := coalesce(v_unit, v_catalog_price);
        v_original := v_unit * v_people;
    end if;

    v_original := round(coalesce(v_original, 0), 2);
    v_item_name := coalesce(v_item_name, v_catalog_name);

    -- Pagamento interamente in punti: i punti li calcola il server sul
    -- prezzo effettivo, non li accetta dal client.
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
            payment_method, payment_status, special_offer_id)
        values (v_email, v_name, v_room, v_date, v_time, v_people,
            v_original, v_points, v_discount, v_final, 'pending', v_notes,
            nullif(p_payload->>'meal_type', ''), v_method, v_pay_status, v_offer_id)
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

    if v_offer_id is not null then
        insert into public.last_minute_purchases (offer_id, user_email, user_name, amount_paid, status)
        values (v_offer_id, v_email, v_name, v_final, v_pay_status);
    end if;

    update public.user_points
       set total_bookings = coalesce(total_bookings, 0) + 1, updated_at = now()
     where user_email = v_email;

    return json_build_object('id', v_booking_id, 'kind', v_kind, 'item_name', v_item_name,
                            'original_price', v_original, 'final_price', v_final,
                            'points_used', v_points, 'payment_method', v_method,
                            'payment_status', v_pay_status,
                            'offer_id', v_offer_id,
                            'list_price', round(coalesce(v_list, v_unit, 0) * v_people, 2));
end $$;

revoke all on function public.create_booking(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_booking(text, jsonb, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
