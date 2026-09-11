-- =====================================================================
-- GuestOS — superficie RPC completa
-- =====================================================================
-- Segue 20260910120000_security_lockdown.sql e 20260910180000_converge_token_contract.sql.
--
-- Regole di questo file:
--   * Una sola funzione per nome. Tutti i parametri oltre a quelli
--     obbligatori hanno un default, così PostgREST risolve la firma con
--     qualunque sottoinsieme di argomenti nominati il client invii.
--     Le sovrascritture (overload) vanno evitate: con i default rendono
--     ambigua la chiamata e PostgREST risponde 404.
--   * L'identità ospite si risolve da `p_token` oppure dall'header
--     `x-guest-token`. Quella admin da `p_admin_token`, dall'header
--     `x-admin-token` oppure dalla sessione Supabase Auth.
--   * Gli errori usano i codici che il client traduce in italiano:
--     SESSION_INVALID, STAY_ENDED, ROOM_OCCUPIED, INVALID_CREDENTIALS,
--     TOO_MANY_ATTEMPTS, INVALID_INPUT, INVALID_EMAIL, EMAIL_IN_USE,
--     USERNAME_TAKEN, INSUFFICIENT_POINTS, OUT_OF_STOCK, REWARD_NOT_FOUND,
--     BOOKING_NOT_FOUND, INVALID_DATE, ALREADY_COMPLETED, RATE_LIMITED,
--     NOT_AUTHORIZED, NOT_FOUND.
--   * Conversione punti/sconto: 10 punti = 1 euro, come già faceva il client.
--
-- Idempotente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Identità admin: niente più corrispondenza per email
-- ---------------------------------------------------------------------
-- La registrazione pubblica su Supabase Auth è aperta. Riconoscere un
-- admin dall'email del JWT significherebbe che chiunque riesca a
-- registrarsi con quell'indirizzo diventa admin. Si lega invece l'admin
-- all'uid di Auth, che non è falsificabile.
alter table public.admin_users add column if not exists auth_user_id uuid unique;

-- Le versioni senza argomenti vanno eliminate prima di creare quelle con
-- parametro: convivendo, una chiamata senza argomenti diventerebbe ambigua
-- e PostgREST risponderebbe "function is not unique". La policy su
-- hotel_settings dipende da is_admin(): si ricrea più sotto passando da
-- guestos_is_admin(), che è il nome usato da tutte le altre policy.
drop policy if exists admin_all on public.hotel_settings;
drop function if exists public.is_admin();
drop function if exists public.guestos_admin_email();

create or replace function public.is_admin(p_admin_token text default null)
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
    select exists (
        select 1 from public.admin_users a
        where a.active = true and a.auth_user_id is not null and a.auth_user_id = auth.uid()
    ) or exists (
        select 1
        from public.admin_sessions s
        join public.admin_users a on a.id = s.admin_id
        where s.token = coalesce(nullif(p_admin_token, ''), public.guestos_header('x-admin-token'))
          and s.expires_at > now()
          and a.active = true
    );
$$;

create or replace function public.guestos_is_admin()
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
    select public.is_admin(null);
$$;

create or replace function public.guestos_admin_email(p_admin_token text default null)
returns text
language sql stable security definer
set search_path = public, extensions
as $$
    select coalesce(
        (select a.email from public.admin_users a
          where a.active = true and a.auth_user_id is not null and a.auth_user_id = auth.uid() limit 1),
        (select a.email from public.admin_sessions s
           join public.admin_users a on a.id = s.admin_id
          where s.token = coalesce(nullif(p_admin_token, ''), public.guestos_header('x-admin-token'))
            and s.expires_at > now()
          limit 1));
$$;

-- Ripristino della policy su hotel_settings, ora via guestos_is_admin()
create policy admin_all on public.hotel_settings for all
    using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()));

create or replace function public.guestos_require_admin(p_admin_token text default null)
returns text
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_email text;
begin
    if not public.is_admin(p_admin_token) then raise exception 'NOT_AUTHORIZED'; end if;
    v_email := public.guestos_admin_email(p_admin_token);
    return coalesce(v_email, 'admin');
end $$;

-- ---------------------------------------------------------------------
-- 2. Assegnazione punti centralizzata (tetto giornaliero 300)
-- ---------------------------------------------------------------------
create or replace function public.guestos_grant_points(
    p_email text, p_points integer, p_reason text, p_reference bigint default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_today_earned integer; v_award integer; v_total integer;
begin
    select coalesce(sum(points_change), 0) into v_today_earned
      from public.point_transactions
     where user_email = p_email and points_change > 0 and created_at >= current_date;

    v_award := greatest(0, least(coalesce(p_points, 0), 300 - v_today_earned));

    insert into public.point_transactions (user_email, points_change, reason, reference_id)
    values (p_email, v_award, p_reason, p_reference);

    if v_award > 0 then
        update public.user_points
           set points = greatest(0, coalesce(points, 0) + v_award), updated_at = now()
         where user_email = p_email
         returning points into v_total;
    else
        select points into v_total from public.user_points where user_email = p_email;
    end if;

    return json_build_object('points_awarded', v_award, 'total', coalesce(v_total, 0));
end $$;

-- Scala punti per uno sconto o un riscatto. Solleva INSUFFICIENT_POINTS.
create or replace function public.guestos_spend_points(
    p_email text, p_points integer, p_reason text, p_reference bigint default null)
returns integer
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_points integer; v_total integer;
begin
    if coalesce(p_points, 0) <= 0 then
        select points into v_total from public.user_points where user_email = p_email;
        return coalesce(v_total, 0);
    end if;

    select points into v_points from public.user_points where user_email = p_email for update;
    if coalesce(v_points, 0) < p_points then raise exception 'INSUFFICIENT_POINTS'; end if;

    update public.user_points
       set points = points - p_points, updated_at = now()
     where user_email = p_email
     returning points into v_total;

    insert into public.point_transactions (user_email, points_change, reason, reference_id)
    values (p_email, -p_points, p_reason, p_reference);

    return v_total;
end $$;

-- ---------------------------------------------------------------------
-- 3. RPC ospite: una sola firma per nome, parametri con default
-- ---------------------------------------------------------------------
drop function if exists public.guest_room_status(text, text);
drop function if exists public.guest_room_status(text);
create function public.guest_room_status(p_room text, p_token text default null)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_end date;
begin
    select id, stay_end_date into v_id, v_end
      from public.users
     where room_number = trim(p_room) and active = true
     order by stay_start_date desc limit 1;

    if v_id is null then return 'free'; end if;
    if v_end < current_date then
        update public.users set active = false where id = v_id;
        return 'ended';
    end if;
    return 'occupied';
end $$;

drop function if exists public.guest_register(text, text, text, integer, text);
drop function if exists public.guest_register(text, text, text, integer);
-- p_stay_days è il nome usato dal client; p_days resta accettato.
create function public.guest_register(
    p_room text, p_last_name text, p_email text,
    p_stay_days integer default null, p_days integer default null, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_room text := trim(p_room);
    v_name text := trim(p_last_name);
    v_email text := lower(trim(p_email));
    v_days integer := coalesce(p_stay_days, p_days);
    v_pin text; v_token text; v_end date;
    v_existing public.users%rowtype; v_user public.users%rowtype;
begin
    if v_days is null or v_days < 1 or v_days > 365 then raise exception 'INVALID_INPUT: durata non valida'; end if;
    if v_room = '' or length(v_name) < 2 then raise exception 'INVALID_INPUT'; end if;
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;

    if exists (select 1 from public.users
                where room_number = v_room and active = true and stay_end_date >= current_date) then
        raise exception 'ROOM_OCCUPIED';
    end if;
    update public.users set active = false where room_number = v_room and active = true;

    v_end := current_date + v_days;
    v_pin := public.guestos_new_pin();

    select * into v_existing from public.users where email = v_email;
    if v_existing.id is not null then
        if v_existing.active and v_existing.stay_end_date >= current_date then
            raise exception 'EMAIL_IN_USE';
        end if;
        begin
            update public.users
               set room_number = v_room, last_name = v_name,
                   stay_start_date = current_date, stay_end_date = v_end,
                   active = true, last_login = now()
             where id = v_existing.id
             returning * into v_user;
        exception when unique_violation then raise exception 'ROOM_OCCUPIED';
        end;
    else
        begin
            insert into public.users (room_number, last_name, email, stay_start_date, stay_end_date, active, last_login)
            values (v_room, v_name, v_email, current_date, v_end, true, now())
            returning * into v_user;
        exception when unique_violation then raise exception 'ROOM_OCCUPIED';
        end;
    end if;

    insert into public.guest_credentials (user_id, pin_hash)
    values (v_user.id, crypt(v_pin, gen_salt('bf', 10)))
    on conflict (user_id) do update set pin_hash = excluded.pin_hash, updated_at = now();

    insert into public.user_points (user_email, user_name, points, level, badges, total_bookings)
    values (v_user.email, v_user.last_name, 0, 1, '[]'::jsonb, 0)
    on conflict (user_email) do nothing;

    v_token := public.guestos_new_token();
    insert into public.guest_sessions (token, user_id, user_email, expires_at)
    values (v_token, v_user.id, v_user.email, now() + interval '30 days');

    return json_build_object(
        'token', v_token, 'pin', v_pin,
        'user', json_build_object(
            'id', v_user.id, 'email', v_user.email, 'room_number', v_user.room_number,
            'last_name', v_user.last_name, 'stay_start_date', v_user.stay_start_date,
            'stay_end_date', v_user.stay_end_date));
end $$;

drop function if exists public.guest_login(text, text, text, text, text);
drop function if exists public.guest_login(text, text, text, text);
create function public.guest_login(
    p_room text, p_last_name text, p_pin text,
    p_email text default null, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_key text := 'guest:' || lower(trim(p_room));
    v_user public.users%rowtype; v_hash text; v_token text;
begin
    begin
        perform public.guestos_check_rate_limit(v_key);
    exception when others then raise exception 'TOO_MANY_ATTEMPTS';
    end;

    select * into v_user from public.users
     where room_number = trim(p_room) and active = true
     order by stay_start_date desc limit 1;

    if v_user.id is null then
        perform public.guestos_record_failure(v_key);
        raise exception 'INVALID_CREDENTIALS';
    end if;
    if v_user.stay_end_date < current_date then
        update public.users set active = false where id = v_user.id;
        raise exception 'STAY_ENDED';
    end if;

    select pin_hash into v_hash from public.guest_credentials where user_id = v_user.id;
    if v_hash is null
       or lower(v_user.last_name) <> lower(trim(coalesce(p_last_name, '')))
       or v_hash <> crypt(coalesce(p_pin, ''), v_hash) then
        perform public.guestos_record_failure(v_key);
        raise exception 'INVALID_CREDENTIALS';
    end if;

    perform public.guestos_clear_failures(v_key);
    update public.users set last_login = now() where id = v_user.id;

    v_token := public.guestos_new_token();
    insert into public.guest_sessions (token, user_id, user_email, expires_at)
    values (v_token, v_user.id, v_user.email, now() + interval '30 days');

    return json_build_object(
        'token', v_token,
        'user', json_build_object(
            'id', v_user.id, 'email', v_user.email, 'room_number', v_user.room_number,
            'last_name', v_user.last_name, 'stay_start_date', v_user.stay_start_date,
            'stay_end_date', v_user.stay_end_date));
end $$;

drop function if exists public.guest_logout(text);
create function public.guest_logout(p_token text default null)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_n integer;
begin
    delete from public.guest_sessions
     where token = coalesce(nullif(p_token, ''), public.guestos_header('x-guest-token'));
    get diagnostics v_n = row_count;
    return v_n > 0;
end $$;

drop function if exists public.guest_me(text);
create function public.guest_me(p_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_id integer; v_user public.users%rowtype; v_pts public.user_points%rowtype;
begin
    v_id := public.guestos_require_guest(p_token);
    select * into v_user from public.users where id = v_id;
    select * into v_pts from public.user_points where user_email = v_user.email;

    return json_build_object(
        'user', json_build_object(
            'id', v_user.id, 'email', v_user.email, 'room_number', v_user.room_number,
            'last_name', v_user.last_name, 'stay_start_date', v_user.stay_start_date,
            'stay_end_date', v_user.stay_end_date,
            'nights_left', greatest(0, v_user.stay_end_date - current_date)),
        'points', json_build_object(
            'points', coalesce(v_pts.points, 0), 'level', coalesce(v_pts.level, 1),
            'badges', coalesce(v_pts.badges, '[]'::jsonb),
            'total_bookings', coalesce(v_pts.total_bookings, 0),
            'user_name', v_pts.user_name, 'username', v_pts.username));
end $$;

create or replace function public.update_profile(
    p_last_name text default null, p_email text default null,
    p_username text default null, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_id integer; v_user public.users%rowtype;
    v_name text; v_email text; v_old_email text;
begin
    v_id := public.guestos_require_guest(p_token);
    select * into v_user from public.users where id = v_id;
    v_old_email := v_user.email;

    v_name := coalesce(nullif(trim(coalesce(p_last_name, '')), ''), v_user.last_name);
    v_email := lower(coalesce(nullif(trim(coalesce(p_email, '')), ''), v_user.email));
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;
    if v_email <> v_old_email and exists (select 1 from public.users where email = v_email) then
        raise exception 'EMAIL_IN_USE';
    end if;

    begin
        update public.users set last_name = v_name, email = v_email
         where id = v_id returning * into v_user;
    exception when unique_violation then raise exception 'EMAIL_IN_USE';
    end;

    -- le righe collegate seguono l'email, che è la chiave usata ovunque
    if v_email <> v_old_email then
        update public.user_points            set user_email = v_email where user_email = v_old_email;
        update public.game_scores            set user_email = v_email where user_email = v_old_email;
        update public.quiz_scores            set user_email = v_email where user_email = v_old_email;
        update public.point_transactions     set user_email = v_email where user_email = v_old_email;
        update public.user_rewards           set user_email = v_email where user_email = v_old_email;
        update public.restaurant_bookings    set user_email = v_email where user_email = v_old_email;
        update public.spa_bookings           set user_email = v_email where user_email = v_old_email;
        update public.tour_bookings          set user_email = v_email where user_email = v_old_email;
        update public.guest_sessions         set user_email = v_email where user_email = v_old_email;
        update public.ai_conversations       set guest_email = v_email where guest_email = v_old_email;
    end if;

    begin
        update public.user_points
           set user_name = v_name,
               username = coalesce(nullif(trim(coalesce(p_username, '')), ''), username),
               updated_at = now()
         where user_email = v_email;
    exception when unique_violation then raise exception 'USERNAME_TAKEN';
    end;

    return json_build_object(
        'id', v_user.id, 'email', v_user.email, 'room_number', v_user.room_number,
        'last_name', v_user.last_name, 'stay_start_date', v_user.stay_start_date,
        'stay_end_date', v_user.stay_end_date);
end $$;

drop function if exists public.award_points(text, integer, text);
create function public.award_points(p_game_id text, p_score integer default 0, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_id integer; v_email text; v_name text;
    v_game text := lower(nullif(trim(coalesce(p_game_id, '')), ''));
    v_score integer := greatest(0, coalesce(p_score, 0));
    v_plays integer; v_res json; v_total integer;
    -- i 19 giochi realmente presenti nel client
    v_allowed text[] := array[
        'color_match','flappy_game','helix_neon','knife_master','logic_pattern','math_dash','memory',
        'neon_blast','neon_jumper','scratch','sliding_puzzle','slot','star_shooter','sudoku_quick',
        'tower_stack','trivia_blitz','wheel','word_scramble','zigzag_neon'];
begin
    v_id := public.guestos_require_guest(p_token);
    if v_game is null or not (v_game = any(v_allowed)) then raise exception 'INVALID_INPUT: gioco non riconosciuto'; end if;

    select u.email, u.last_name into v_email, v_name from public.users u where u.id = v_id;

    -- il punteggio migliore resta in classifica anche oltre il tetto punti
    insert into public.game_scores (user_email, game_id, score, user_name, updated_at)
    values (v_email, v_game, v_score, v_name, now())
    on conflict (user_email, game_id) do update
        set score = greatest(game_scores.score, excluded.score),
            user_name = excluded.user_name, updated_at = now();

    -- massimo 20 partite premiate al giorno: oltre, zero punti ma nessun errore
    select count(*) into v_plays
      from public.point_transactions
     where user_email = v_email and reason = 'game' and created_at >= current_date;

    if v_plays >= 20 then
        select points into v_total from public.user_points where user_email = v_email;
        return json_build_object('points_awarded', 0, 'total', coalesce(v_total, 0));
    end if;

    -- 1 punto ogni 10 di punteggio, massimo 50 per partita
    v_res := public.guestos_grant_points(v_email, least(50, v_score / 10), 'game', null);
    return v_res;
end $$;

drop function if exists public.redeem_reward(integer, text);
create function public.redeem_reward(p_reward_id integer, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text; v_reward public.rewards%rowtype; v_left integer; v_code text;
begin
    v_id := public.guestos_require_guest(p_token);
    select email into v_email from public.users where id = v_id;

    select * into v_reward from public.rewards where id = p_reward_id and active = true;
    if v_reward.id is null then raise exception 'REWARD_NOT_FOUND'; end if;
    -- convenzione dei dati esistenti: stock negativo o nullo = illimitato
    if v_reward.stock is not null and v_reward.stock = 0 then raise exception 'OUT_OF_STOCK'; end if;

    v_left := public.guestos_spend_points(v_email, v_reward.points_required, 'reward', v_reward.id);

    if v_reward.stock is not null and v_reward.stock > 0 then
        update public.rewards set stock = stock - 1 where id = v_reward.id;
    end if;

    -- status ammessi dal vincolo su user_rewards: pending | used | expired
    insert into public.user_rewards (user_email, reward_id, status)
    values (v_email, v_reward.id, 'pending')
    returning code into v_code;

    return json_build_object('code', v_code, 'reward', v_reward.name,
                            'remaining_points', v_left, 'points_left', v_left);
end $$;

drop function if exists public.save_push_subscription(text, text, text, text, text);
create function public.save_push_subscription(
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
    values (v_email, p_endpoint, p_p256dh, p_auth, p_user_agent, now());
    return true;
end $$;

-- ---------------------------------------------------------------------
-- 4. Prenotazioni
-- ---------------------------------------------------------------------
-- p_payload accetta: booking_date, booking_time, num_people, notes,
-- points_used, e per la spa treatment_id/treatment_name, per i tour
-- tour_id/tour_name/user_phone. I prezzi li decide il server dal catalogo:
-- 10 punti valgono 1 euro di sconto.
create or replace function public.create_booking(p_kind text, p_payload jsonb, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_id integer; v_email text; v_name text;
    v_kind text := lower(trim(coalesce(p_kind, '')));
    v_date date; v_time time; v_people integer; v_notes text;
    v_points integer; v_discount numeric; v_original numeric; v_final numeric;
    v_ref_id bigint; v_booking_id bigint; v_room text;
begin
    v_id := public.guestos_require_guest(p_token);
    select u.email, u.last_name, u.room_number into v_email, v_name, v_room
      from public.users u where u.id = v_id;

    if v_kind not in ('restaurant', 'spa', 'tour') then raise exception 'INVALID_INPUT: tipo prenotazione non valido'; end if;

    v_date := nullif(p_payload->>'booking_date', '')::date;
    if v_date is null then v_date := nullif(p_payload->>'tour_date', '')::date; end if;
    if v_date is null or v_date < current_date then raise exception 'INVALID_DATE'; end if;

    v_time   := coalesce(nullif(p_payload->>'booking_time', '')::time, '10:00'::time);
    v_people := greatest(1, coalesce(nullif(p_payload->>'num_people', '')::integer, 1));
    v_notes  := nullif(p_payload->>'notes', '');
    v_points := greatest(0, coalesce(nullif(p_payload->>'points_used', '')::integer, 0));

    if v_kind = 'restaurant' then
        v_original := coalesce(nullif(p_payload->>'original_price', '')::numeric, 0);
    elsif v_kind = 'spa' then
        v_ref_id := nullif(p_payload->>'treatment_id', '')::bigint;
        select price * v_people into v_original from public.spa_services where id = v_ref_id;
        v_original := coalesce(v_original, nullif(p_payload->>'original_price', '')::numeric, 0);
    else
        v_ref_id := nullif(p_payload->>'tour_id', '')::bigint;
        select price * v_people into v_original from public.tours where id = v_ref_id;
        v_original := coalesce(v_original, nullif(p_payload->>'original_price', '')::numeric, 0);
    end if;

    -- lo sconto non può superare il totale
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
        values (v_email, v_name, v_ref_id, nullif(p_payload->>'treatment_name', ''), v_date, v_time,
            nullif(p_payload->>'duration_minutes', '')::integer, v_people, v_final, v_original,
            v_points, v_discount, v_final, 'pending', v_notes)
        returning id into v_booking_id;

    else
        insert into public.tour_bookings (
            user_email, user_name, user_phone, tour_id, tour_name, booking_date, tour_date,
            num_people, total_price, original_price, points_used, discount_amount, final_price,
            status, payment_status, notes)
        values (v_email, v_name, nullif(p_payload->>'user_phone', ''), v_ref_id,
            nullif(p_payload->>'tour_name', ''), v_date, v_date, v_people, v_final, v_original,
            v_points, v_discount, v_final, 'pending', 'unpaid', v_notes)
        returning id into v_booking_id;
    end if;

    update public.user_points
       set total_bookings = coalesce(total_bookings, 0) + 1, updated_at = now()
     where user_email = v_email;

    return json_build_object('id', v_booking_id, 'kind', v_kind,
                            'final_price', v_final, 'points_used', v_points);
end $$;

create or replace function public.cancel_booking(p_kind text, p_booking_id bigint, p_token text default null)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text; v_kind text := lower(trim(coalesce(p_kind, ''))); v_n integer := 0;
begin
    v_id := public.guestos_require_guest(p_token);
    select email into v_email from public.users where id = v_id;

    if v_kind = 'restaurant' then
        update public.restaurant_bookings set status = 'cancelled'
         where id = p_booking_id and user_email = v_email and status <> 'cancelled';
    elsif v_kind = 'spa' then
        update public.spa_bookings set status = 'cancelled'
         where id = p_booking_id and user_email = v_email and status <> 'cancelled';
    elsif v_kind = 'tour' then
        update public.tour_bookings set status = 'cancelled'
         where id = p_booking_id and user_email = v_email and status <> 'cancelled';
    else
        raise exception 'INVALID_INPUT: tipo prenotazione non valido';
    end if;

    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'BOOKING_NOT_FOUND'; end if;
    return true;
end $$;

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
            select id, booking_date, booking_time, num_people, status, final_price, notes
              from public.restaurant_bookings where user_email = v_email) t), '[]'::json),
        'spa', coalesce((select json_agg(t order by t.booking_date desc) from (
            select id, booking_date, booking_time, treatment_name, num_people, status, final_price, notes
              from public.spa_bookings where user_email = v_email) t), '[]'::json),
        'tour', coalesce((select json_agg(t order by t.booking_date desc) from (
            select id, booking_date, tour_name, num_people, status, final_price, notes
              from public.tour_bookings where user_email = v_email) t), '[]'::json));
end $$;

-- ---------------------------------------------------------------------
-- 5. Classifiche, quiz, sfide
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard(p_limit integer default 50, p_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_email text;
begin
    v_email := (select u.email from public.users u where u.id = public.guestos_resolve_guest(p_token));
    if v_email is null and not public.is_admin(null) then raise exception 'SESSION_INVALID'; end if;

    return coalesce((select json_agg(t) from (
        select coalesce(up.username, up.user_name, 'Ospite') as name,
               coalesce(up.points, 0) as points, coalesce(up.level, 1) as level,
               (up.user_email = v_email) as is_me
          from public.user_points up
         order by up.points desc nulls last
         limit greatest(1, least(coalesce(p_limit, 50), 200))) t), '[]'::json);
end $$;

create or replace function public.get_game_leaderboard(
    p_game_id text, p_limit integer default 50, p_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_email text;
begin
    v_email := (select u.email from public.users u where u.id = public.guestos_resolve_guest(p_token));
    if v_email is null and not public.is_admin(null) then raise exception 'SESSION_INVALID'; end if;

    return coalesce((select json_agg(t) from (
        select coalesce(gs.username, gs.user_name, 'Ospite') as name,
               gs.score, (gs.user_email = v_email) as is_me
          from public.game_scores gs
         where gs.game_id = lower(trim(coalesce(p_game_id, '')))
         order by gs.score desc
         limit greatest(1, least(coalesce(p_limit, 50), 200))) t), '[]'::json);
end $$;

-- Punti quiz sulla percentuale di risposte corrette, come faceva il client:
-- >=90% 40 punti, >=70% 25, >=50% 10, sotto 5.
create or replace function public.submit_quiz(
    p_quiz_id text, p_score integer, p_max_score integer default 10, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_id integer; v_email text; v_name text;
    v_score integer := greatest(0, coalesce(p_score, 0));
    v_max integer := greatest(1, coalesce(p_max_score, 10));
    v_pct numeric; v_points integer; v_today integer;
begin
    v_id := public.guestos_require_guest(p_token);
    select u.email, u.last_name into v_email, v_name from public.users u where u.id = v_id;
    if v_score > v_max then v_score := v_max; end if;

    select count(*) into v_today from public.quiz_scores
     where user_email = v_email and created_at >= current_date;
    if v_today >= 20 then
        return json_build_object('points_awarded', 0,
            'total', (select points from public.user_points where user_email = v_email));
    end if;

    insert into public.quiz_scores (user_email, user_name, quiz_type, score, max_score,
                                    correct_answers, total_questions, completed_at)
    values (v_email, v_name, nullif(trim(coalesce(p_quiz_id, '')), ''), v_score, v_max,
            v_score, v_max, now());

    v_pct := v_score::numeric / v_max;
    v_points := case when v_pct >= 0.9 then 40 when v_pct >= 0.7 then 25 when v_pct >= 0.5 then 10 else 5 end;

    return public.guestos_grant_points(v_email, v_points, 'quiz', null);
end $$;

create or replace function public.post_challenge(p_text text, p_answer text, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text; v_name text; v_new uuid; v_today integer;
begin
    v_id := public.guestos_require_guest(p_token);
    select u.email, u.last_name into v_email, v_name from public.users u where u.id = v_id;

    if length(trim(coalesce(p_text, ''))) < 10 or length(trim(coalesce(p_answer, ''))) < 1 then
        raise exception 'INVALID_INPUT';
    end if;

    select count(*) into v_today from public.community_challenges
     where author_email = v_email and created_at >= current_date;
    if v_today >= 5 then raise exception 'RATE_LIMITED'; end if;

    insert into public.community_challenges (author_email, author_name, challenge_text, answer,
                                             points, difficulty, is_approved)
    values (v_email, coalesce(v_name, 'Ospite'), trim(p_text), lower(trim(p_answer)), 10, 'medium', true)
    returning id into v_new;

    return json_build_object('id', v_new);
end $$;

create or replace function public.complete_challenge(p_challenge_id uuid, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text; v_ch public.community_challenges%rowtype;
begin
    v_id := public.guestos_require_guest(p_token);
    select email into v_email from public.users where id = v_id;

    select * into v_ch from public.community_challenges where id = p_challenge_id and is_approved = true;
    if v_ch.id is null then raise exception 'NOT_FOUND'; end if;
    if v_ch.author_email = v_email then raise exception 'INVALID_INPUT: non puoi completare la tua sfida'; end if;

    if exists (select 1 from public.challenge_completions
                where challenge_id = p_challenge_id and user_email = v_email) then
        raise exception 'ALREADY_COMPLETED';
    end if;

    insert into public.challenge_completions (challenge_id, user_email) values (p_challenge_id, v_email);
    return public.guestos_grant_points(v_email, coalesce(v_ch.points, 10), 'challenge', null);
end $$;

-- ---------------------------------------------------------------------
-- 6. Chat AI
-- ---------------------------------------------------------------------
create or replace function public.log_ai_message(
    p_conversation_id uuid default null, p_role text default 'user', p_content text default '',
    p_meta jsonb default '{}'::jsonb, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text; v_name text; v_conv uuid; v_msg uuid; v_role text;
begin
    v_id := public.guestos_require_guest(p_token);
    select u.email, u.last_name into v_email, v_name from public.users u where u.id = v_id;

    v_role := lower(trim(coalesce(p_role, 'user')));
    if v_role not in ('user', 'assistant', 'system') then raise exception 'INVALID_INPUT'; end if;
    if coalesce(trim(p_content), '') = '' then raise exception 'INVALID_INPUT'; end if;

    v_conv := p_conversation_id;
    if v_conv is not null then
        -- la conversazione deve essere dell'ospite che sta scrivendo
        if not exists (select 1 from public.ai_conversations
                        where id = v_conv and guest_email = v_email) then
            v_conv := null;
        end if;
    end if;

    if v_conv is null then
        insert into public.ai_conversations (guest_email, guest_name, status, language, started_at, last_message_at)
        values (v_email, v_name, 'active', 'it', now(), now())
        returning id into v_conv;
    end if;

    insert into public.ai_messages (conversation_id, role, content, metadata)
    values (v_conv, v_role, left(p_content, 8000), coalesce(p_meta, '{}'::jsonb))
    returning id into v_msg;

    update public.ai_conversations set last_message_at = now() where id = v_conv;

    return json_build_object('conversation_id', v_conv, 'message_id', v_msg);
end $$;

create or replace function public.get_my_ai_history(
    p_limit integer default 20, p_conversation_id uuid default null, p_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text; v_conv uuid;
begin
    v_id := public.guestos_require_guest(p_token);
    select email into v_email from public.users where id = v_id;

    v_conv := coalesce(p_conversation_id,
        (select id from public.ai_conversations
          where guest_email = v_email order by last_message_at desc nulls last limit 1));
    if v_conv is null then return '[]'::json; end if;
    if not exists (select 1 from public.ai_conversations where id = v_conv and guest_email = v_email) then
        raise exception 'NOT_AUTHORIZED';
    end if;

    return coalesce((select json_agg(t order by t.created_at) from (
        select id, role, content, created_at
          from public.ai_messages where conversation_id = v_conv
         order by created_at desc
         limit greatest(1, least(coalesce(p_limit, 20), 100))) t), '[]'::json);
end $$;

create or replace function public.submit_ai_feedback(
    p_message_id uuid, p_rating integer, p_comment text default null, p_token text default null)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_email text; v_conv uuid; v_rating integer;
begin
    v_id := public.guestos_require_guest(p_token);
    select email into v_email from public.users where id = v_id;

    -- il vincolo su ai_feedback ammette solo -1 e 1
    v_rating := case when coalesce(p_rating, 0) >= 1 then 1 else -1 end;

    select m.conversation_id into v_conv
      from public.ai_messages m
      join public.ai_conversations c on c.id = m.conversation_id
     where m.id = p_message_id and c.guest_email = v_email;
    if v_conv is null then raise exception 'NOT_FOUND'; end if;

    insert into public.ai_feedback (message_id, conversation_id, rating, comment)
    values (p_message_id, v_conv, v_rating, nullif(trim(coalesce(p_comment, '')), ''));
    return true;
end $$;

-- ---------------------------------------------------------------------
-- 7. RPC admin
-- ---------------------------------------------------------------------
drop function if exists public.admin_login(text, text);
create function public.admin_login(p_email text, p_password text)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_key text := 'admin:' || lower(trim(coalesce(p_email, '')));
    v_admin public.admin_users%rowtype; v_hotel text; v_token text;
begin
    begin
        perform public.guestos_check_rate_limit(v_key);
    exception when others then raise exception 'TOO_MANY_ATTEMPTS';
    end;

    select a.* into v_admin from public.admin_users a
     where lower(a.email) = lower(trim(coalesce(p_email, ''))) and a.active = true;

    if v_admin.id is null or v_admin.password_hash is null
       or v_admin.password_hash <> crypt(coalesce(p_password, ''), v_admin.password_hash) then
        perform public.guestos_record_failure(v_key);
        raise exception 'INVALID_CREDENTIALS';
    end if;

    perform public.guestos_clear_failures(v_key);
    update public.admin_users a set last_login = now() where a.id = v_admin.id;
    select h.name into v_hotel from public.hotels h where h.id = v_admin.hotel_id;

    v_token := public.guestos_new_token();
    insert into public.admin_sessions (token, admin_id, admin_email, role, hotel_id, expires_at)
    values (v_token, v_admin.id, v_admin.email, v_admin.role, v_admin.hotel_id, now() + interval '24 hours');

    return json_build_object(
        'token', v_token,
        'admin', json_build_object(
            'id', v_admin.id, 'email', v_admin.email, 'full_name', v_admin.full_name,
            'role', v_admin.role, 'hotel_id', v_admin.hotel_id, 'hotel_name', v_hotel));
end $$;

drop function if exists public.admin_logout();
create function public.admin_logout(p_admin_token text default null)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_n integer;
begin
    delete from public.admin_sessions
     where token = coalesce(nullif(p_admin_token, ''), public.guestos_header('x-admin-token'));
    get diagnostics v_n = row_count;
    return v_n > 0;
end $$;

create or replace function public.admin_me(p_admin_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_email text; v_admin public.admin_users%rowtype; v_hotel text;
begin
    v_email := public.guestos_require_admin(p_admin_token);
    select a.* into v_admin from public.admin_users a where lower(a.email) = lower(v_email);
    select h.name into v_hotel from public.hotels h where h.id = v_admin.hotel_id;
    return json_build_object('id', v_admin.id, 'email', v_admin.email, 'full_name', v_admin.full_name,
                            'role', v_admin.role, 'hotel_id', v_admin.hotel_id, 'hotel_name', v_hotel);
end $$;

drop function if exists public.admin_reset_guest_pin(integer);
create function public.admin_reset_guest_pin(p_user_id integer, p_admin_token text default null)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_admin text; v_pin text;
begin
    v_admin := public.guestos_require_admin(p_admin_token);
    if not exists (select 1 from public.users where id = p_user_id) then raise exception 'NOT_FOUND'; end if;

    v_pin := public.guestos_new_pin();
    insert into public.guest_credentials (user_id, pin_hash)
    values (p_user_id, crypt(v_pin, gen_salt('bf', 10)))
    on conflict (user_id) do update set pin_hash = excluded.pin_hash, updated_at = now();

    delete from public.guest_sessions where user_id = p_user_id;
    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (v_admin, 'reset_pin', 'user', p_user_id, '{}'::jsonb);
    return v_pin;
end $$;

drop function if exists public.admin_adjust_points(text, integer);
create function public.admin_adjust_points(p_email text, p_new_points integer, p_admin_token text default null)
returns integer
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_admin text; v_total integer;
begin
    v_admin := public.guestos_require_admin(p_admin_token);
    if p_new_points is null or p_new_points < 0 then raise exception 'INVALID_INPUT'; end if;

    update public.user_points set points = p_new_points, updated_at = now()
     where user_email = p_email returning points into v_total;
    if v_total is null then raise exception 'NOT_FOUND'; end if;

    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (v_admin, 'adjust_points', 'user_points', null,
            jsonb_build_object('email', p_email, 'new_points', p_new_points));
    return v_total;
end $$;

create or replace function public.admin_checkout(p_user_id integer, p_admin_token text default null)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_admin text; v_n integer;
begin
    v_admin := public.guestos_require_admin(p_admin_token);
    update public.users set active = false where id = p_user_id and active = true;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'NOT_FOUND'; end if;

    delete from public.guest_sessions where user_id = p_user_id;
    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (v_admin, 'checkout', 'user', p_user_id, '{}'::jsonb);
    return true;
end $$;

drop function if exists public.extend_stay(integer, integer);
drop function if exists public.extend_stay(integer, integer, text);
create function public.extend_stay(p_user_id integer, p_days integer, p_admin_token text default null)
returns date
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_admin text; v_new_date date;
begin
    v_admin := public.guestos_require_admin(p_admin_token);
    if p_days is null or p_days < 1 or p_days > 365 then raise exception 'INVALID_INPUT: giorni non validi'; end if;

    update public.users set stay_end_date = stay_end_date + p_days
     where id = p_user_id returning stay_end_date into v_new_date;
    if v_new_date is null then raise exception 'NOT_FOUND'; end if;

    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (v_admin, 'extend_stay', 'user', p_user_id,
            jsonb_build_object('days', p_days, 'new_end_date', v_new_date));
    return v_new_date;
end $$;

create or replace function public.admin_set_staff_note(
    p_user_id integer, p_note text, p_admin_token text default null)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_admin text;
begin
    v_admin := public.guestos_require_admin(p_admin_token);
    if not exists (select 1 from public.users where id = p_user_id) then raise exception 'NOT_FOUND'; end if;

    insert into public.guest_staff_notes (user_id, note, updated_by, updated_at)
    values (p_user_id, nullif(trim(coalesce(p_note, '')), ''), v_admin, now())
    on conflict (user_id) do update
        set note = excluded.note, updated_by = excluded.updated_by, updated_at = now();

    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (v_admin, 'staff_note', 'user', p_user_id, '{}'::jsonb);
    return true;
end $$;

create or replace function public.admin_update_hotel_settings(p_payload jsonb, p_admin_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_admin text; v_row public.hotel_settings%rowtype;
begin
    v_admin := public.guestos_require_admin(p_admin_token);

    update public.hotel_settings set
        name                  = coalesce(nullif(p_payload->>'name', ''), name),
        city                  = coalesce(p_payload->>'city', city),
        total_rooms           = coalesce(nullif(p_payload->>'total_rooms', '')::integer, total_rooms),
        restaurant_hours      = coalesce(p_payload->>'restaurant_hours', restaurant_hours),
        spa_hours             = coalesce(p_payload->>'spa_hours', spa_hours),
        reception_phone       = coalesce(p_payload->>'reception_phone', reception_phone),
        checkout_time         = coalesce(p_payload->>'checkout_time', checkout_time),
        wifi_note             = coalesce(p_payload->>'wifi_note', wifi_note),
        welcome_message       = coalesce(p_payload->>'welcome_message', welcome_message),
        ai_extra_instructions = coalesce(p_payload->>'ai_extra_instructions', ai_extra_instructions),
        updated_at            = now()
      where id = 1
      returning * into v_row;

    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (v_admin, 'update_settings', 'hotel_settings', 1, coalesce(p_payload, '{}'::jsonb));

    return row_to_json(v_row);
end $$;

create or replace function public.admin_overview_stats(p_admin_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
    perform public.guestos_require_admin(p_admin_token);
    return json_build_object(
        'active_stays',    (select count(*) from public.users where active = true and stay_end_date >= current_date),
        'checkins_today',  (select count(*) from public.users where stay_start_date = current_date),
        'checkouts_today', (select count(*) from public.users where stay_end_date = current_date and active = true),
        'guests_total',    (select count(*) from public.users),
        'points_total',    (select coalesce(sum(points), 0) from public.user_points),
        'bookings_pending',(select (select count(*) from public.restaurant_bookings where status = 'pending')
                                 + (select count(*) from public.spa_bookings where status = 'pending')
                                 + (select count(*) from public.tour_bookings where status = 'pending')),
        'revenue_30d',     (select coalesce(sum(amount), 0) from public.payments
                             where status in ('succeeded', 'completed') and created_at >= now() - interval '30 days'));
end $$;

create or replace function public.admin_revenue_7d(p_admin_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
    perform public.guestos_require_admin(p_admin_token);
    return coalesce((select json_agg(t order by t.day desc) from (
        select date_trunc('day', created_at)::date as day, item_type,
               count(*) as transactions, coalesce(sum(amount), 0) as revenue
          from public.payments
         where status in ('succeeded', 'completed') and created_at >= now() - interval '7 days'
         group by 1, 2) t), '[]'::json);
end $$;

create or replace function public.admin_top_guests(p_limit integer default 10, p_admin_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
    perform public.guestos_require_admin(p_admin_token);
    return coalesce((select json_agg(t) from (
        select up.user_email, up.user_name, up.points, up.total_bookings
          from public.user_points up
         order by up.points desc nulls last
         limit greatest(1, least(coalesce(p_limit, 10), 100))) t), '[]'::json);
end $$;

-- ---------------------------------------------------------------------
-- 8. L'autore vede le proprie sfide anche prima dell'approvazione
-- ---------------------------------------------------------------------
drop policy if exists guest_select on public.community_challenges;
create policy guest_select on public.community_challenges for select
    using ((select public.guestos_guest_email()) is not null
           and (is_approved = true or author_email = (select public.guestos_guest_email())));

-- ---------------------------------------------------------------------
-- 9. Storico punteggi: flappy-game scriveva con l'id 'neon_dash'
-- ---------------------------------------------------------------------
update public.game_scores gs set game_id = 'flappy_game'
 where gs.game_id = 'neon_dash'
   and not exists (select 1 from public.game_scores x
                    where x.user_email = gs.user_email and x.game_id = 'flappy_game');
delete from public.game_scores where game_id = 'neon_dash';

-- ---------------------------------------------------------------------
-- 10. Privilegi: eseguibili dal browser solo le RPC, mai gli helper
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
    for r in
        select p.oid::regprocedure as sig, p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('guestos_header','guestos_guest_id','guestos_guest_email','guestos_is_admin',
                            'guestos_admin_email','guestos_resolve_guest','guestos_require_guest',
                            'guestos_require_admin','guestos_check_rate_limit','guestos_record_failure',
                            'guestos_clear_failures','guestos_new_token','guestos_new_pin',
                            'guestos_grant_points','guestos_spend_points','is_admin',
                            'guest_room_status','guest_register','guest_login','guest_logout','guest_me',
                            'update_profile','award_points','redeem_reward','save_push_subscription',
                            'create_booking','cancel_booking','get_my_bookings','get_leaderboard',
                            'get_game_leaderboard','submit_quiz','post_challenge','complete_challenge',
                            'log_ai_message','get_my_ai_history','submit_ai_feedback',
                            'admin_login','admin_logout','admin_me','admin_reset_guest_pin',
                            'admin_adjust_points','admin_checkout','extend_stay','admin_set_staff_note',
                            'admin_update_hotel_settings','admin_overview_stats','admin_revenue_7d',
                            'admin_top_guests','log_admin_action','get_booking_stats')
    loop
        execute format('revoke all on function %s from public, anon, authenticated', r.sig);
        if r.proname in ('guestos_header','guestos_guest_id','guestos_guest_email','guestos_is_admin',
                         'guestos_admin_email','is_admin',
                         'guest_room_status','guest_register','guest_login','guest_logout','guest_me',
                         'update_profile','award_points','redeem_reward','save_push_subscription',
                         'create_booking','cancel_booking','get_my_bookings','get_leaderboard',
                         'get_game_leaderboard','submit_quiz','post_challenge','complete_challenge',
                         'log_ai_message','get_my_ai_history','submit_ai_feedback',
                         'admin_login','admin_logout','admin_me','admin_reset_guest_pin',
                         'admin_adjust_points','admin_checkout','extend_stay','admin_set_staff_note',
                         'admin_update_hotel_settings','admin_overview_stats','admin_revenue_7d',
                         'admin_top_guests','log_admin_action','get_booking_stats')
        then
            execute format('grant execute on function %s to anon, authenticated', r.sig);
        end if;
    end loop;
end $$;

commit;

notify pgrst, 'reload schema';
