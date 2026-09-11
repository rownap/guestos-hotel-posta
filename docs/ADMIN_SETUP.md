# Accesso alla console admin

La console (`guestos-admin-login.html`) **non usa Supabase Auth**. Gli operatori
stanno nella tabella `admin_users`, con la password in bcrypt, e la sessione è un
token in `admin_sessions` che vale 24 ore.

Conseguenza pratica: non esiste un "password dimenticata" via email. Una password
si reimposta solo dal database, con la procedura qui sotto.

## Come funziona il login

1. `admin_login(p_email, p_password)` cerca l'operatore fra gli `admin_users`
   attivi e confronta la password con `crypt()`.
2. Se combacia, crea una riga in `admin_sessions` con un token casuale e
   scadenza a 24 ore, e la restituisce al browser.
3. Il token finisce in `localStorage.guestos_admin_token`. Da lì `config.js` lo
   mette come header `x-admin-token` su ogni chiamata a Supabase.
4. Le policy `admin_all` chiamano `guestos_is_admin()`, che legge quell'header:
   è il database a decidere cosa l'operatore può vedere e scrivere.

Il rate limit è lo stesso degli ospiti: dopo una serie di tentativi falliti
`admin_login` risponde `TOO_MANY_ATTEMPTS` e va atteso il tempo di sblocco.

## Eseguire SQL sul progetto

Serve l'SQL editor di Supabase (Dashboard → SQL Editor) oppure la Management
API. Le query qui sotto valgono in entrambi.

> **Attenzione, è l'errore che si fa sempre.** In questo progetto `pgcrypto` è
> installata nello schema `extensions`, non in `public`. Nell'SQL editor
> `crypt()` e `gen_salt()` **non si trovano** se non le qualifichi. Scrivi
> `extensions.crypt(...)` e `extensions.gen_salt(...)`, oppure anteponi
> `set search_path = public, extensions;` alla sessione.

## Creare un amministratore

```sql
insert into public.admin_users (email, password_hash, full_name, role, hotel_id, active)
values (
    'direzione@hotelposta.it',
    extensions.crypt('LaPasswordScelta', extensions.gen_salt('bf', 10)),
    'Nome Cognome',
    'admin',
    (select id from public.hotels order by id limit 1),
    true
);
```

La password in chiaro compare nella cronologia dell'SQL editor: usane una
provvisoria e falla cambiare al primo accesso.

## Reimpostare una password

```sql
update public.admin_users
   set password_hash = extensions.crypt('NuovaPassword', extensions.gen_salt('bf', 10))
 where lower(email) = lower('direzione@hotelposta.it');
```

Le sessioni già aperte **restano valide fino a scadenza**: cambiare la password
non scollega chi è già dentro. Per buttare fuori tutti:

```sql
delete from public.admin_sessions
 where admin_email = 'direzione@hotelposta.it';
```

## Sospendere o riattivare un operatore

```sql
-- sospendi: non potrà più fare login
update public.admin_users set active = false where lower(email) = lower('...');
delete from public.admin_sessions where admin_email = '...';   -- e chiudi le sessioni aperte

-- riattiva
update public.admin_users set active = true where lower(email) = lower('...');
```

Sospendere senza cancellare le sessioni non serve a niente per le 24 ore
successive: fai sempre le due cose insieme.

## Verificare chi ha accesso

```sql
select id, email, full_name, role, active, last_login
  from public.admin_users
 order by active desc, last_login desc nulls last;
```

Sessioni aperte in questo momento:

```sql
select admin_email, role, expires_at
  from public.admin_sessions
 where expires_at > now()
 order by expires_at;
```

## Manutenzione

Le sessioni scadute vengono ripulite dalle RPC di login, ma non fa male passare
ogni tanto:

```sql
delete from public.admin_sessions where expires_at < now();
delete from public.guest_sessions where expires_at < now();
```

## Cosa resta tracciato

Ogni azione amministrativa passa da `log_admin_action` e finisce in
`admin_audit_log`: chi, cosa, su quale ospite e quando. La tabella è leggibile
solo da un amministratore.

```sql
select created_at, admin_email, action, target_id
  from public.admin_audit_log
 order by created_at desc
 limit 50;
```

## Se una RPC risponde 404

Dopo un DDL che tocca funzioni o policy, PostgREST deve rileggere lo schema:

```sql
notify pgrst, 'reload schema';
```

Senza quel comando le funzioni nuove esistono nel database ma rispondono 404 al
browser.
