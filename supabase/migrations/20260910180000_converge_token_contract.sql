-- =====================================================================
-- GuestOS — convergenza del contratto di sessione
-- =====================================================================
-- Segue 20260910120000_security_lockdown.sql. Allinea il DB al contratto
-- già implementato nel client (guest-session.js, guestos-admin-*):
--
--   * token ospite in formato UUID, accettato sia come parametro RPC
--     `p_token` sia come header HTTP `x-guest-token` (le policy RLS sulle
--     letture dirette di tabella continuano a usare l'header).
--   * `is_admin()` come unico punto di verità per i permessi admin: vale
--     sia la sessione Supabase Auth (email in admin_users) sia il token
--     `x-admin-token` emesso da admin_login. Così il passaggio ad Auth
--     non richiede di riscrivere le policy.
--   * RPC ospite mancanti: guest_me, award_points, redeem_reward,
--     save_push_subscription, create_booking.
--   * RPC admin: admin_adjust_points, extend_stay(p_user_id, p_days).
--   * hotel_settings: configurazione hotel leggibile da anon.
--
-- Idempotente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Token UUID + risoluzione da parametro o header
-- ---------------------------------------------------------------------
create or replace function public.guestos_new_token()
returns text
language sql volatile
set search_path = public, extensions
as $$
    select gen_random_uuid()::text;
$$;

-- Risolve un token esplicito (p_token) oppure, se nullo, l'header.
create or replace function public.guestos_resolve_guest(p_token text default null)
returns integer
language sql stable security definer
set search_path = public, extensions
as $$
    select s.user_id
    from public.guest_sessions s
    join public.users u on u.id = s.user_id
    where s.token = coalesce(nullif(p_token, ''), public.guestos_header('x-guest-token'))
      and s.expires_at > now()
      and u.active = true
      and u.stay_end_date >= current_date
    limit 1;
$$;

create or replace function public.guestos_require_guest(p_token text default null)
returns integer
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_id integer;
begin
    v_id := public.guestos_resolve_guest(p_token);
    if v_id is null then raise exception 'SESSION_INVALID'; end if;
    return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 2. is_admin(): Supabase Auth oppure x-admin-token
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
    select exists (
        -- sessione Supabase Auth: l'email del JWT deve essere un admin attivo
        select 1 from public.admin_users a
        where a.active = true
          and lower(a.email) = lower(coalesce(
                nullif(current_setting('request.jwt.claim.email', true), ''),
                (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email'),
                ''))
    ) or exists (
        -- sessione custom emessa da admin_login (header x-admin-token)
        select 1
        from public.admin_sessions s
        join public.admin_users a on a.id = s.admin_id
        where s.token = public.guestos_header('x-admin-token')
          and s.expires_at > now()
          and a.active = true
    );
$$;

-- guestos_is_admin() resta il nome usato dalle policy: ora delega a is_admin()
create or replace function public.guestos_is_admin()
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
    select public.is_admin();
$$;

create or replace function public.guestos_admin_email()
returns text
language sql stable security definer
set search_path = public, extensions
as $$
    select coalesce(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email'),
        (select a.email
           from public.admin_sessions s
           join public.admin_users a on a.id = s.admin_id
          where s.token = public.guestos_header('x-admin-token')
            and s.expires_at > now()
          limit 1));
$$;

-- ---------------------------------------------------------------------
-- 6. Vincolo univoco per l'upsert dei punteggi di gioco
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.game_scores'::regclass and contype = 'u'
    ) then
        delete from public.game_scores gs
         where exists (select 1 from public.game_scores x
                        where x.user_email = gs.user_email and x.game_id = gs.game_id
                          and (x.score > gs.score or (x.score = gs.score and x.ctid > gs.ctid)));
        alter table public.game_scores add constraint game_scores_user_game_key unique (user_email, game_id);
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. RPC ospite: p_token opzionale su login/logout, nuove guest_me/award_points
-- ---------------------------------------------------------------------
drop function if exists public.guest_logout();
create function public.guest_logout(p_token text default null)
returns void
language sql security definer
set search_path = public, extensions
as $$
    delete from public.guest_sessions
    where token = coalesce(nullif(p_token, ''), public.guestos_header('x-guest-token'));
$$;

-- Profilo + punti dell'ospite corrente.
create or replace function public.guest_me(p_token text default null)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_id integer; v_user public.users%rowtype; v_pts public.user_points%rowtype;
begin
    v_id := public.guestos_require_guest(p_token);
    select * into v_user from public.users where id = v_id;
    select * into v_pts  from public.user_points where user_email = v_user.email;

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
            'user_name', v_pts.user_name, 'username', v_pts.username)
    );
end $$;

-- Assegna punti per una partita. I punti li calcola il server: 1 punto ogni
-- 10 di punteggio, con i tetti documentati nel client (50 per partita,
-- 300 al giorno, 20 partite al giorno).
create or replace function public.award_points(p_game_id text, p_score integer, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_id     integer;
    v_email  text;
    v_game   text := lower(nullif(trim(coalesce(p_game_id, '')), ''));
    v_score  integer := greatest(0, coalesce(p_score, 0));
    v_today  date := current_date;
    v_plays  integer;
    v_earned integer;
    v_award  integer;
    v_total  integer;
begin
    v_id := public.guestos_require_guest(p_token);
    if v_game is null then raise exception 'INVALID_INPUT'; end if;
    select email into v_email from public.users where id = v_id;

    select count(*), coalesce(sum(points_change), 0)
      into v_plays, v_earned
      from public.point_transactions
     where user_email = v_email
       and reason = 'game'
       and created_at >= v_today;

    if v_plays >= 20 then raise exception 'RATE_LIMITED'; end if;

    v_award := least(50, v_score / 10);
    v_award := least(v_award, greatest(0, 300 - v_earned));

    if v_award > 0 then
        insert into public.point_transactions (user_email, points_change, reason)
        values (v_email, v_award, 'game');

        update public.user_points
           set points = greatest(0, coalesce(points, 0) + v_award), updated_at = now()
         where user_email = v_email
         returning points into v_total;
    else
        -- registra comunque la partita, per il tetto giornaliero
        insert into public.point_transactions (user_email, points_change, reason)
        values (v_email, 0, 'game');
        select points into v_total from public.user_points where user_email = v_email;
    end if;

    -- miglior punteggio per la classifica di gioco
    insert into public.game_scores (user_email, game_id, score, user_name, updated_at)
    select v_email, v_game, v_score, u.last_name, now() from public.users u where u.id = v_id
    on conflict (user_email, game_id) do update
        set score = greatest(game_scores.score, excluded.score), updated_at = now();

    return json_build_object('points_awarded', v_award, 'total', coalesce(v_total, 0));
end $$;

-- Riscatto premio: controlla punti e stock lato server.
create or replace function public.redeem_reward(p_reward_id integer, p_token text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
    v_id integer; v_email text; v_reward public.rewards%rowtype; v_points integer; v_code text;
begin
    v_id := public.guestos_require_guest(p_token);
    select email into v_email from public.users where id = v_id;

    select * into v_reward from public.rewards where id = p_reward_id and active = true;
    if v_reward.id is null then raise exception 'REWARD_NOT_FOUND'; end if;
    -- convenzione dei dati esistenti: stock negativo o nullo = illimitato
    if v_reward.stock is not null and v_reward.stock = 0 then raise exception 'OUT_OF_STOCK'; end if;

    select points into v_points from public.user_points where user_email = v_email for update;
    if coalesce(v_points, 0) < v_reward.points_required then raise exception 'INSUFFICIENT_POINTS'; end if;

    update public.user_points
       set points = points - v_reward.points_required, updated_at = now()
     where user_email = v_email;

    insert into public.point_transactions (user_email, points_change, reason, reference_id)
    values (v_email, -v_reward.points_required, 'reward', v_reward.id);

    if v_reward.stock is not null and v_reward.stock > 0 then
        update public.rewards set stock = stock - 1 where id = v_reward.id;
    end if;

    -- status ammessi dal vincolo su user_rewards: pending | used | expired
    insert into public.user_rewards (user_email, reward_id, status)
    values (v_email, v_reward.id, 'pending')
    returning code into v_code;

    return json_build_object('code', v_code, 'reward', v_reward.name,
                            'points_left', coalesce(v_points, 0) - v_reward.points_required);
end $$;

create or replace function public.save_push_subscription(
    p_endpoint text, p_p256dh text default null, p_auth text default null,
    p_user_agent text default null, p_token text default null)
returns void
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
end $$;

-- ---------------------------------------------------------------------
-- 4. RPC admin
-- ---------------------------------------------------------------------
create or replace function public.admin_adjust_points(p_email text, p_new_points integer)
returns integer
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_total integer;
begin
    if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
    if p_new_points is null or p_new_points < 0 then raise exception 'INVALID_INPUT'; end if;

    update public.user_points
       set points = p_new_points, updated_at = now()
     where user_email = p_email
     returning points into v_total;

    if v_total is null then raise exception 'NOT_FOUND'; end if;

    perform public.log_admin_action(public.guestos_admin_email(), 'adjust_points', 'user_points', null,
        jsonb_build_object('email', p_email, 'new_points', p_new_points));
    return v_total;
end $$;

-- extend_stay senza p_admin_email (l'email viene dalla sessione)
drop function if exists public.extend_stay(integer, integer, text);
create or replace function public.extend_stay(p_user_id integer, p_days integer)
returns table(new_end_date date)
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_new_date date;
begin
    if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
    if p_days is null or p_days < 1 or p_days > 365 then raise exception 'INVALID_DAYS'; end if;

    update public.users set stay_end_date = stay_end_date + p_days
     where id = p_user_id returning stay_end_date into v_new_date;
    if v_new_date is null then raise exception 'NOT_FOUND'; end if;

    perform public.log_admin_action(public.guestos_admin_email(), 'extend_stay', 'user', p_user_id,
        jsonb_build_object('days', p_days, 'new_end_date', v_new_date));
    return query select v_new_date;
end $$;

-- log_admin_action: l'email arriva dalla sessione, il parametro resta per compatibilità
create or replace function public.log_admin_action(p_admin_email text, p_action text, p_target_type text, p_target_id integer, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
    if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
    insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
    values (coalesce(public.guestos_admin_email(), p_admin_email), p_action, p_target_type, p_target_id, p_details);
end $$;

-- ---------------------------------------------------------------------
-- 5. hotel_settings (usata da api/chat.js e dalla dashboard)
-- ---------------------------------------------------------------------
create table if not exists public.hotel_settings (
    id                    integer primary key default 1,
    name                  text not null default 'Hotel Posta',
    city                  text default 'Tropea, Calabria',
    total_rooms           integer default 50,
    restaurant_hours      text default '12:30-14:30 e 19:30-22:00',
    spa_hours             text default '10:00-20:00',
    reception_phone       text default 'digita 0 dal telefono della camera',
    checkout_time         text default '11:00',
    wifi_note             text default 'WiFi gratuito in tutta la struttura',
    welcome_message       text default '',
    ai_extra_instructions text default '',
    updated_at            timestamptz not null default now(),
    constraint hotel_settings_singleton check (id = 1)
);
insert into public.hotel_settings (id) values (1) on conflict (id) do nothing;

alter table public.hotel_settings enable row level security;
revoke all on table public.hotel_settings from anon, authenticated;
grant select, insert, update on table public.hotel_settings to anon, authenticated;
drop policy if exists public_read on public.hotel_settings;
drop policy if exists admin_all   on public.hotel_settings;
create policy public_read on public.hotel_settings for select using (true);
create policy admin_all   on public.hotel_settings for all
    using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 7. Privilegi
-- ---------------------------------------------------------------------
revoke all on function public.guestos_resolve_guest(text) from public, anon, authenticated;
revoke all on function public.guestos_require_guest(text) from public, anon, authenticated;

grant execute on function public.is_admin()                                     to anon, authenticated;
grant execute on function public.guestos_is_admin()                             to anon, authenticated;
grant execute on function public.guestos_admin_email()                          to anon, authenticated;
grant execute on function public.guestos_new_token()                            to anon, authenticated;
grant execute on function public.guest_logout(text)                             to anon, authenticated;
grant execute on function public.guest_me(text)                                 to anon, authenticated;
grant execute on function public.award_points(text, integer, text)              to anon, authenticated;
grant execute on function public.redeem_reward(integer, text)                   to anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_adjust_points(text, integer)             to anon, authenticated;
grant execute on function public.extend_stay(integer, integer)                  to anon, authenticated;
grant execute on function public.log_admin_action(text, text, text, integer, jsonb) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 8. Il client aggiunge p_token a ogni RPC quando è loggato: le RPC di
--    accesso lo accettano e lo ignorano, così non fallisce la risoluzione
--    della firma (PostgREST risponderebbe 404).
-- ---------------------------------------------------------------------
create or replace function public.guest_room_status(p_room text, p_token text default null)
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
drop function if exists public.guest_room_status(text);
revoke all on function public.guest_room_status(text, text) from public, anon, authenticated;
grant execute on function public.guest_room_status(text, text) to anon, authenticated;
