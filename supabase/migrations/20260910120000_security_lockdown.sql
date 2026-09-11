-- =====================================================================
-- GuestOS — SECURITY LOCKDOWN (RLS + sessioni server-side)
-- =====================================================================
-- Contesto: la anon key è pubblica per design (sta nel sorgente). Tutto
-- ciò che il browser può fare deve quindi essere autorizzato da RLS.
--
-- Modello:
--   * login ospite / admin avviene SOLO tramite RPC SECURITY DEFINER che
--     verificano le credenziali e restituiscono un token di sessione random.
--   * il client invia il token negli header HTTP `x-guest-token` /
--     `x-admin-token` (supabase-js: global.headers). Le policy RLS leggono
--     gli header tramite current_setting('request.headers').
--   * PIN ospiti hashati (bcrypt) in `guest_credentials`; password admin
--     restano in `admin_users`. Nessuna delle due tabelle è leggibile
--     dal browser.
--   * Ogni tabella ha RLS + policy esplicite. Tutte le policy precedenti
--     vengono eliminate.
--
-- Idempotente: può essere rieseguita.
-- =====================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Nuove tabelle di supporto (mai esposte al browser)
-- ---------------------------------------------------------------------
create table if not exists public.guest_sessions (
    token        text primary key,
    user_id      integer not null references public.users(id) on delete cascade,
    user_email   text not null,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null,
    last_seen_at timestamptz
);
create index if not exists guest_sessions_user_idx on public.guest_sessions(user_id);

create table if not exists public.admin_sessions (
    token       text primary key,
    admin_id    integer not null references public.admin_users(id) on delete cascade,
    admin_email text not null,
    role        text,
    hotel_id    integer,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null
);

create table if not exists public.guest_credentials (
    user_id    integer primary key references public.users(id) on delete cascade,
    pin_hash   text not null,
    updated_at timestamptz not null default now()
);

create table if not exists public.guest_staff_notes (
    user_id    integer primary key references public.users(id) on delete cascade,
    note       text,
    updated_by text,
    updated_at timestamptz not null default now()
);

create table if not exists public.login_attempts (
    key          text primary key,
    failures     integer not null default 0,
    locked_until timestamptz,
    last_attempt timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Migrazione dati sensibili fuori da `users`
-- ---------------------------------------------------------------------
do $$
begin
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'users' and column_name = 'pin') then
        insert into public.guest_credentials (user_id, pin_hash)
        select id, crypt(pin, gen_salt('bf', 10))
        from public.users
        where pin is not null and pin <> ''
        on conflict (user_id) do nothing;

        alter table public.users drop column pin;
    end if;

    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'users' and column_name = 'staff_notes') then
        insert into public.guest_staff_notes (user_id, note)
        select id, staff_notes from public.users
        where staff_notes is not null and staff_notes <> ''
        on conflict (user_id) do nothing;

        alter table public.users drop column staff_notes;
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Funzioni di identità (usate dalle policy)
-- ---------------------------------------------------------------------
create or replace function public.guestos_header(p_name text)
returns text
language sql stable
set search_path = public, extensions
as $$
    select nullif(coalesce(current_setting('request.headers', true), '{}')::json ->> p_name, '');
$$;

create or replace function public.guestos_guest_id()
returns integer
language sql stable security definer
set search_path = public, extensions
as $$
    select s.user_id
    from public.guest_sessions s
    join public.users u on u.id = s.user_id
    where s.token = public.guestos_header('x-guest-token')
      and s.expires_at > now()
      and u.active = true
      and u.stay_end_date >= current_date
    limit 1;
$$;

create or replace function public.guestos_guest_email()
returns text
language sql stable security definer
set search_path = public, extensions
as $$
    select u.email
    from public.guest_sessions s
    join public.users u on u.id = s.user_id
    where s.token = public.guestos_header('x-guest-token')
      and s.expires_at > now()
      and u.active = true
      and u.stay_end_date >= current_date
    limit 1;
$$;

create or replace function public.guestos_is_admin()
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
    select exists (
        select 1
        from public.admin_sessions s
        join public.admin_users a on a.id = s.admin_id
        where s.token = public.guestos_header('x-admin-token')
          and s.expires_at > now()
          and a.active = true
    );
$$;

create or replace function public.guestos_admin_email()
returns text
language sql stable security definer
set search_path = public, extensions
as $$
    select a.email
    from public.admin_sessions s
    join public.admin_users a on a.id = s.admin_id
    where s.token = public.guestos_header('x-admin-token')
      and s.expires_at > now()
      and a.active = true
    limit 1;
$$;

-- ---------------------------------------------------------------------
-- 4. Rate limiting server-side (interno, non esposto)
-- ---------------------------------------------------------------------
create or replace function public.guestos_check_rate_limit(p_key text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_locked timestamptz;
begin
    select locked_until into v_locked from public.login_attempts where key = p_key;
    if v_locked is not null and v_locked > now() then
        raise exception 'LOCKED' using errcode = 'P0001';
    end if;
end $$;

create or replace function public.guestos_record_failure(p_key text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
    insert into public.login_attempts as la (key, failures, last_attempt)
    values (p_key, 1, now())
    on conflict (key) do update
        set failures     = case when la.last_attempt < now() - interval '10 minutes' then 1 else la.failures + 1 end,
            last_attempt = now();

    -- 5 tentativi falliti in 10 minuti -> blocco di 10 minuti
    update public.login_attempts
       set locked_until = now() + interval '10 minutes', failures = 0
     where key = p_key and failures >= 5;
end $$;

create or replace function public.guestos_clear_failures(p_key text)
returns void
language sql security definer
set search_path = public, extensions
as $$
    delete from public.login_attempts where key = p_key;
$$;

create or replace function public.guestos_new_token()
returns text
language sql volatile
set search_path = public, extensions
as $$
    select encode(gen_random_bytes(32), 'hex');
$$;

create or replace function public.guestos_new_pin()
returns text
language sql volatile
set search_path = public, extensions
as $$
    select lpad((abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
$$;

-- ---------------------------------------------------------------------
-- 5. RPC pubbliche: ospiti
-- ---------------------------------------------------------------------
-- Stato camera senza esporre dati personali: 'free' | 'occupied' | 'ended'
create or replace function public.guest_room_status(p_room text)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_id integer; v_end date;
begin
    select id, stay_end_date into v_id, v_end
    from public.users
    where room_number = trim(p_room) and active = true
    order by stay_start_date desc
    limit 1;

    if v_id is null then return 'free'; end if;
    if v_end < current_date then
        update public.users set active = false where id = v_id;
        return 'ended';
    end if;
    return 'occupied';
end $$;

create or replace function public.guest_register(p_room text, p_last_name text, p_email text, p_days integer)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_room     text := trim(p_room);
    v_name     text := trim(p_last_name);
    v_email    text := lower(trim(p_email));
    v_pin      text;
    v_token    text;
    v_end      date;
    v_existing public.users%rowtype;
    v_user     public.users%rowtype;
begin
    if p_days is null or p_days < 1 or p_days > 365 then raise exception 'INVALID_DAYS'; end if;
    if v_room = '' or length(v_name) < 2 then raise exception 'INVALID_INPUT'; end if;
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;

    -- camera libera?
    if exists (select 1 from public.users
               where room_number = v_room and active = true and stay_end_date >= current_date) then
        raise exception 'ROOM_OCCUPIED';
    end if;
    update public.users set active = false where room_number = v_room and active = true;

    v_end := current_date + p_days;
    v_pin := public.guestos_new_pin();

    select * into v_existing from public.users where email = v_email;
    if v_existing.id is not null then
        -- email già nota: se il soggiorno precedente è finito, riattiviamo
        -- lo stesso account (mantiene i punti). Altrimenti è in uso.
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
        exception when unique_violation then
            raise exception 'ROOM_OCCUPIED';
        end;
    else
        begin
            insert into public.users (room_number, last_name, email, stay_start_date, stay_end_date, active, last_login)
            values (v_room, v_name, v_email, current_date, v_end, true, now())
            returning * into v_user;
        exception when unique_violation then
            raise exception 'ROOM_OCCUPIED';
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
        'token', v_token,
        'pin',   v_pin,
        'user',  json_build_object(
            'id', v_user.id, 'email', v_user.email, 'room_number', v_user.room_number,
            'last_name', v_user.last_name, 'stay_start_date', v_user.stay_start_date,
            'stay_end_date', v_user.stay_end_date)
    );
end $$;

create or replace function public.guest_login(p_room text, p_last_name text, p_pin text, p_email text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_key   text := 'guest:' || lower(trim(p_room));
    v_user  public.users%rowtype;
    v_hash  text;
    v_token text;
begin
    perform public.guestos_check_rate_limit(v_key);

    select * into v_user from public.users
    where room_number = trim(p_room) and active = true
    order by stay_start_date desc limit 1;

    if v_user.id is null then
        perform public.guestos_record_failure(v_key);
        raise exception 'NO_ACCOUNT';
    end if;
    if v_user.stay_end_date < current_date then
        update public.users set active = false where id = v_user.id;
        raise exception 'STAY_ENDED';
    end if;

    select pin_hash into v_hash from public.guest_credentials where user_id = v_user.id;
    if v_hash is null
       or lower(v_user.last_name) <> lower(trim(p_last_name))
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
        'user',  json_build_object(
            'id', v_user.id, 'email', v_user.email, 'room_number', v_user.room_number,
            'last_name', v_user.last_name, 'stay_start_date', v_user.stay_start_date,
            'stay_end_date', v_user.stay_end_date)
    );
end $$;

create or replace function public.guest_logout()
returns void
language sql security definer
set search_path = public, extensions
as $$
    delete from public.guest_sessions where token = public.guestos_header('x-guest-token');
$$;

-- ---------------------------------------------------------------------
-- 6. RPC pubbliche: admin
-- ---------------------------------------------------------------------
drop function if exists public.admin_login(text, text);
create function public.admin_login(p_email text, p_password text)
returns table(id integer, email text, full_name text, hotel_id integer, hotel_name text, role text, token text)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_key   text := 'admin:' || lower(trim(p_email));
    v_admin public.admin_users%rowtype;
    v_hotel text;
    v_token text;
begin
    perform public.guestos_check_rate_limit(v_key);

    select a.* into v_admin from public.admin_users a
    where lower(a.email) = lower(trim(p_email)) and a.active = true;

    if v_admin.id is null or v_admin.password_hash <> crypt(coalesce(p_password, ''), v_admin.password_hash) then
        perform public.guestos_record_failure(v_key);
        return;
    end if;

    perform public.guestos_clear_failures(v_key);
    update public.admin_users a set last_login = now() where a.id = v_admin.id;
    select h.name into v_hotel from public.hotels h where h.id = v_admin.hotel_id;

    v_token := public.guestos_new_token();
    insert into public.admin_sessions (token, admin_id, admin_email, role, hotel_id, expires_at)
    values (v_token, v_admin.id, v_admin.email, v_admin.role, v_admin.hotel_id, now() + interval '24 hours');

    return query select v_admin.id, v_admin.email, v_admin.full_name, v_admin.hotel_id, v_hotel, v_admin.role, v_token;
end $$;

create or replace function public.admin_logout()
returns void
language sql security definer
set search_path = public, extensions
as $$
    delete from public.admin_sessions where token = public.guestos_header('x-admin-token');
$$;

-- Genera un nuovo PIN per un ospite (solo admin). Il PIN viene mostrato
-- una sola volta all'operatore.
create or replace function public.admin_reset_guest_pin(p_user_id integer)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_pin text;
begin
    if not public.guestos_is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
    if not exists (select 1 from public.users where id = p_user_id) then raise exception 'NOT_FOUND'; end if;

    v_pin := public.guestos_new_pin();
    insert into public.guest_credentials (user_id, pin_hash)
    values (p_user_id, crypt(v_pin, gen_salt('bf', 10)))
    on conflict (user_id) do update set pin_hash = excluded.pin_hash, updated_at = now();

    delete from public.guest_sessions where user_id = p_user_id;

    perform public.log_admin_action(public.guestos_admin_email(), 'reset_pin', 'user', p_user_id, '{}'::jsonb);
    return v_pin;
end $$;

-- Funzioni admin preesistenti: aggiunto il controllo di sessione admin.
create or replace function public.log_admin_action(p_admin_email text, p_action text, p_target_type text, p_target_id integer, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
    if not public.guestos_is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (coalesce(public.guestos_admin_email(), p_admin_email), p_action, p_target_type, p_target_id, p_details);
end $$;

create or replace function public.extend_stay(p_user_id integer, p_days integer, p_admin_email text)
returns table(new_end_date date)
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_new_date date;
begin
    if not public.guestos_is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
    if p_days is null or p_days < 1 or p_days > 365 then raise exception 'INVALID_DAYS'; end if;

    update public.users
       set stay_end_date = stay_end_date + p_days
     where id = p_user_id
     returning stay_end_date into v_new_date;

    if v_new_date is null then raise exception 'NOT_FOUND'; end if;

    perform public.log_admin_action(public.guestos_admin_email(), 'extend_stay', 'user', p_user_id,
        jsonb_build_object('days', p_days, 'new_end_date', v_new_date));

    return query select v_new_date;
end $$;

create or replace function public.get_booking_stats(p_date_from date default (current_date - 7), p_date_to date default current_date)
returns table(booking_type text, total_count bigint, confirmed_count bigint, pending_count bigint, total_revenue numeric)
language plpgsql security definer
set search_path = public, extensions
as $$
begin
    if not public.guestos_is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
    return query
    select 'restaurant'::text, count(*)::bigint,
           count(*) filter (where status = 'confirmed')::bigint,
           count(*) filter (where status = 'pending')::bigint,
           coalesce(sum(final_price), 0)::numeric
      from public.restaurant_bookings where booking_date between p_date_from and p_date_to
    union all
    select 'tours'::text, count(*)::bigint,
           count(*) filter (where status = 'confirmed')::bigint,
           count(*) filter (where status = 'pending')::bigint,
           coalesce(sum(final_price), 0)::numeric
      from public.tour_bookings where coalesce(tour_date, booking_date) between p_date_from and p_date_to
    union all
    select 'spa'::text, count(*)::bigint,
           count(*) filter (where status = 'confirmed')::bigint,
           count(*) filter (where status = 'pending')::bigint,
           coalesce(sum(final_price), 0)::numeric
      from public.spa_bookings where booking_date between p_date_from and p_date_to;
end $$;

-- Il trigger user_points_auto_create resta com'è (SECURITY DEFINER).
-- Contatore completamenti sfide community: aggiornato via trigger, non dal client.
create or replace function public.bump_challenge_completion_count()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
begin
    update public.community_challenges
       set completion_count = coalesce(completion_count, 0) + 1
     where id = new.challenge_id;
    return new;
end $$;
drop trigger if exists challenge_completion_count on public.challenge_completions;
create trigger challenge_completion_count
after insert on public.challenge_completions
for each row execute function public.bump_challenge_completion_count();

-- ---------------------------------------------------------------------
-- 7. Privilegi funzioni
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
    -- default: nessuna funzione GuestOS è eseguibile dal browser
    for r in
        select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in (
            'guestos_header','guestos_guest_id','guestos_guest_email','guestos_is_admin','guestos_admin_email',
            'guestos_check_rate_limit','guestos_record_failure','guestos_clear_failures','guestos_new_token','guestos_new_pin',
            'guest_room_status','guest_register','guest_login','guest_logout',
            'admin_login','admin_logout','admin_reset_guest_pin','log_admin_action','extend_stay','get_booking_stats',
            'create_user_points_on_signup','bump_challenge_completion_count','generate_reward_code','set_reward_code',
            'update_conversation_timestamp','update_updated_at_column','get_conversation_history')
    loop
        execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    end loop;
end $$;

-- eseguibili dal browser (anon)
grant execute on function public.guestos_header(text)      to anon, authenticated;
grant execute on function public.guestos_guest_id()        to anon, authenticated;
grant execute on function public.guestos_guest_email()     to anon, authenticated;
grant execute on function public.guestos_is_admin()        to anon, authenticated;
grant execute on function public.guestos_admin_email()     to anon, authenticated;
grant execute on function public.guest_room_status(text)   to anon, authenticated;
grant execute on function public.guest_register(text, text, text, integer) to anon, authenticated;
grant execute on function public.guest_login(text, text, text, text)       to anon, authenticated;
grant execute on function public.guest_logout()            to anon, authenticated;
grant execute on function public.admin_login(text, text)   to anon, authenticated;
grant execute on function public.admin_logout()            to anon, authenticated;
grant execute on function public.admin_reset_guest_pin(integer) to anon, authenticated;
grant execute on function public.log_admin_action(text, text, text, integer, jsonb) to anon, authenticated;
grant execute on function public.extend_stay(integer, integer, text)        to anon, authenticated;
grant execute on function public.get_booking_stats(date, date)              to anon, authenticated;
grant execute on function public.get_conversation_history(uuid, integer)    to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Reset completo di grant e policy su tutte le tabelle/viste public
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'public' loop
        execute format('revoke all on table public.%I from anon, authenticated', r.tablename);
        execute format('alter table public.%I enable row level security', r.tablename);
    end loop;
    for r in select viewname from pg_views where schemaname = 'public' loop
        execute format('revoke all on table public.%I from anon, authenticated', r.viewname);
    end loop;
    for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
        execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    end loop;
end $$;

-- Nuove tabelle create da ora in poi: nessun privilegio automatico ad anon
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Policy: helper per leggibilità
-- ---------------------------------------------------------------------
-- Nota: (select fn()) fa valutare la funzione una volta per statement.

-- 9a. Catalogo pubblico in lettura, scrittura solo admin
do $$
declare
    t text;
    tables text[] := array['activities','animation_activities','app_config','ai_knowledge_base','daily_riddles',
                           'flash_deals','last_minute_offers','restaurant_menu','rewards','rooms','spa_services',
                           'spa_treatments','spa_time_slots','tours','ui_sections','weekly_challenges'];
begin
    foreach t in array tables loop
        execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t);
        execute format('create policy admin_all on public.%I for all using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()))', t);
    end loop;
end $$;
create policy public_read on public.activities            for select using (active = true);
create policy public_read on public.animation_activities  for select using (true);
create policy public_read on public.app_config            for select using (true);
create policy public_read on public.ai_knowledge_base     for select using (is_active = true);
create policy public_read on public.daily_riddles         for select using (is_active = true);
create policy public_read on public.flash_deals           for select using (true);
create policy public_read on public.last_minute_offers    for select using (true);
create policy public_read on public.restaurant_menu       for select using (true);
create policy public_read on public.rewards               for select using (true);
create policy public_read on public.rooms                 for select using (available = true);
create policy public_read on public.spa_services          for select using (true);
create policy public_read on public.spa_treatments        for select using (true);
create policy public_read on public.spa_time_slots        for select using (true);
create policy public_read on public.tours                 for select using (true);
create policy public_read on public.ui_sections           for select using (true);
create policy public_read on public.weekly_challenges     for select using (is_active = true);

-- 9b. Dati personali ospite: solo la propria riga (o admin)
-- users: ospite legge solo sé stesso; scritture solo admin (registrazione/login via RPC)
grant select, insert, update, delete on table public.users to anon, authenticated;
create policy admin_all  on public.users for all    using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()));
create policy guest_self on public.users for select using (id = (select public.guestos_guest_id()));

-- user_points: ospite legge/aggiorna la propria riga; insert solo via trigger; classifica via vista
grant select, update, insert, delete on table public.user_points to anon, authenticated;
create policy admin_all    on public.user_points for all    using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()));
create policy guest_select on public.user_points for select using (user_email = (select public.guestos_guest_email()));
create policy guest_update on public.user_points for update using (user_email = (select public.guestos_guest_email()))
                                                        with check (user_email = (select public.guestos_guest_email()));

-- tabelle con colonna user_email: select/insert propria riga, admin tutto
do $$
declare
    t text;
    tables text[] := array['game_scores','quiz_scores','challenge_completions','weekly_challenge_completions',
                           'user_rewards','user_push_subscriptions','restaurant_bookings','tour_bookings','spa_bookings',
                           'payments','last_minute_purchases','stripe_customers','point_transactions'];
begin
    foreach t in array tables loop
        execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t);
        execute format('create policy admin_all on public.%I for all using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()))', t);
        execute format('create policy guest_select on public.%I for select using (user_email = (select public.guestos_guest_email()))', t);
        execute format('create policy guest_insert on public.%I for insert with check (user_email = (select public.guestos_guest_email()))', t);
    end loop;
end $$;
-- upsert punteggi / aggiornamento nome nei propri record
create policy guest_update on public.game_scores for update using (user_email = (select public.guestos_guest_email()))
                                                        with check (user_email = (select public.guestos_guest_email()));
create policy guest_delete on public.user_push_subscriptions for delete using (user_email = (select public.guestos_guest_email()));

-- community_challenges: visibili agli ospiti loggati (approvate), autore può inserire/aggiornare le proprie
grant select, insert, update, delete on table public.community_challenges to anon, authenticated;
create policy admin_all    on public.community_challenges for all    using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()));
create policy guest_select on public.community_challenges for select using (is_approved = true and (select public.guestos_guest_email()) is not null);
create policy guest_insert on public.community_challenges for insert with check (author_email = (select public.guestos_guest_email()));
create policy guest_update on public.community_challenges for update using (author_email = (select public.guestos_guest_email()))
                                                                 with check (author_email = (select public.guestos_guest_email()));

-- AI chat: conversazioni legate a guest_email
grant select, insert, update on table public.ai_conversations to anon, authenticated;
create policy admin_all    on public.ai_conversations for all    using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()));
create policy guest_select on public.ai_conversations for select using (guest_email = (select public.guestos_guest_email()));
create policy guest_insert on public.ai_conversations for insert with check (guest_email = (select public.guestos_guest_email()));
create policy guest_update on public.ai_conversations for update using (guest_email = (select public.guestos_guest_email()))
                                                             with check (guest_email = (select public.guestos_guest_email()));

grant select, insert on table public.ai_messages to anon, authenticated;
create policy admin_all    on public.ai_messages for all    using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()));
create policy guest_select on public.ai_messages for select using (conversation_id in (select id from public.ai_conversations where guest_email = (select public.guestos_guest_email())));
create policy guest_insert on public.ai_messages for insert with check (conversation_id in (select id from public.ai_conversations where guest_email = (select public.guestos_guest_email())));

grant select, insert on table public.ai_actions to anon, authenticated;
create policy admin_all    on public.ai_actions for all    using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()));
create policy guest_select on public.ai_actions for select using (conversation_id in (select id from public.ai_conversations where guest_email = (select public.guestos_guest_email())));
create policy guest_insert on public.ai_actions for insert with check (conversation_id in (select id from public.ai_conversations where guest_email = (select public.guestos_guest_email())));

grant select, insert on table public.ai_feedback to anon, authenticated;
create policy admin_all    on public.ai_feedback for all    using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()));
create policy guest_insert on public.ai_feedback for insert with check (conversation_id in (select id from public.ai_conversations where guest_email = (select public.guestos_guest_email())));

-- 9c. Solo admin
do $$
declare
    t text;
    tables text[] := array['admin_audit_log','guest_staff_notes','hotels','bookings','animation_bookings',
                           'lastminute_bookings','ai_analytics','photo_challenges'];
begin
    foreach t in array tables loop
        execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t);
        execute format('create policy admin_all on public.%I for all using ((select public.guestos_is_admin())) with check ((select public.guestos_is_admin()))', t);
    end loop;
end $$;

-- 9d. Mai dal browser (nessun grant, RLS attiva senza policy):
--     admin_users, guest_sessions, admin_sessions, guest_credentials, login_attempts
--     viste dashboard_stats, revenue_analytics, top_customers

-- ---------------------------------------------------------------------
-- 10. Viste classifica senza email (solo per ospiti loggati o admin)
-- ---------------------------------------------------------------------
create or replace view public.leaderboard as
    select up.id, up.user_name, up.username, up.points, up.level, up.badges, up.total_bookings,
           up.created_at, up.updated_at,
           (up.user_email = public.guestos_guest_email()) as is_me
    from public.user_points up
    where public.guestos_guest_email() is not null or public.guestos_is_admin();

create or replace view public.game_leaderboard as
    select gs.game_id, gs.score, gs.user_name, gs.username, gs.updated_at,
           (gs.user_email = public.guestos_guest_email()) as is_me
    from public.game_scores gs
    where public.guestos_guest_email() is not null or public.guestos_is_admin();

grant select on public.leaderboard, public.game_leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. Pulizia sessioni scadute (best effort, chiamata dalle login RPC)
-- ---------------------------------------------------------------------
delete from public.guest_sessions where expires_at < now();
delete from public.admin_sessions where expires_at < now();

commit;

notify pgrst, 'reload schema';
