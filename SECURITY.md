# Security Policy

## Modello di sicurezza

La app è un frontend statico che parla direttamente con Supabase (PostgREST).
Non esiste un backend che faccia da filtro: **l'unico confine di sicurezza è il
database**. Da qui derivano le due regole che governano tutto il resto:

1. La `anon key` in `config.js` è pubblica per progetto. Sta nel sorgente di
   ogni pagina e nel repository. Non è un segreto e non va rigenerata a ogni
   deploy: da sola non deve dare accesso a nessun dato personale.
2. Ogni tabella raggiungibile dal browser ha Row Level Security attiva e
   policy esplicite. Le operazioni che richiedono di verificare credenziali o
   applicare regole di business passano da funzioni `SECURITY DEFINER` (RPC),
   mai da scritture dirette del client.

Lo stato del database è descritto dalle migration in `supabase/migrations/`,
in ordine cronologico. Sono idempotenti e rieseguibili.

## Identità

### Ospiti

Gli ospiti non hanno un account Supabase Auth: si identificano con numero di
camera, cognome e un PIN a 6 cifre consegnato alla registrazione.

- Registrazione e accesso passano **solo** dalle RPC `guest_register`,
  `guest_login`, `guest_room_status`. Il client non scrive mai sulla tabella
  `users`.
- Il PIN è salvato **solo** come hash bcrypt in `guest_credentials`, tabella
  senza alcun privilegio per `anon`. Il PIN in chiaro viene restituito una sola
  volta, al momento in cui viene generato, e non viene salvato sul dispositivo.
- Il login riuscito crea una riga in `guest_sessions` e restituisce un token
  UUID con scadenza 30 giorni. Il token sta in `localStorage` (`guestos_token`)
  e viaggia nell'header `x-guest-token`, impostato da `config.js`.
- Le policy RLS risolvono l'identità con `guestos_guest_id()` /
  `guestos_guest_email()`, che leggono quell'header. Un token vale solo se la
  sessione non è scaduta, l'ospite è `active` e il soggiorno non è terminato:
  la disattivazione da parte dello staff ha effetto immediato.
- `guest_room_status` risponde `free` / `occupied` / `ended` senza rivelare chi
  occupa la camera.

### Admin

- L'accesso avviene con `admin_login(email, password)`, che verifica la
  password bcrypt in `admin_users`, crea una riga in `admin_sessions` e
  restituisce un token con scadenza 24 ore. Il client lo conserva in
  `localStorage` (`guestos_admin_token`) e lo presenta come header
  `x-admin-token` oppure come parametro `p_admin_token`.
- `is_admin()` è l'unico punto di verità e riconosce due strade: il token di
  sessione qui sopra, oppure un utente Supabase Auth il cui `auth.uid()`
  compare in `admin_users.auth_user_id`.
- **Il riconoscimento per email è stato deliberatamente escluso.** Sul
  progetto la registrazione pubblica a Supabase Auth è aperta: se un admin
  fosse riconosciuto dall'email presente nel token di Auth, chiunque
  riuscisse a registrarsi con l'indirizzo di un amministratore otterrebbe i
  suoi permessi. Il legame passa quindi dall'identificativo, non
  dall'indirizzo.
- Le operazioni sensibili sono RPC che verificano `is_admin()` e scrivono da
  sole su `admin_audit_log`: `admin_reset_guest_pin`, `admin_adjust_points`,
  `admin_checkout`, `extend_stay`, `admin_set_staff_note`,
  `admin_update_hotel_settings`, oltre alle letture aggregate
  `admin_overview_stats`, `admin_revenue_7d`, `admin_top_guests`.
- Il PIN di un ospite non è leggibile da nessuno, staff incluso. La dashboard
  può solo generarne uno nuovo con `admin_reset_guest_pin`, che invalida le
  sessioni attive di quell'ospite e mostra il PIN una volta sola.

## Rate limiting

Il blocco dei tentativi di accesso è lato server, nella tabella
`login_attempts`: 5 tentativi falliti sulla stessa camera (o sulla stessa email
admin) bloccano per 10 minuti. Un contatore nel browser era aggirabile
svuotando `localStorage`.

## Autorizzazioni per tabella

Nessuna tabella concede privilegi ad `anon` per default: i grant sono espliciti,
tabella per tabella, e le `default privileges` per le tabelle future sono
revocate.

**Dal browser non si scrive su nessuna tabella con dati dell'ospite.** I
privilegi di `INSERT`, `UPDATE` e `DELETE` per `anon` e `authenticated` sono
revocati su tutte: le modifiche passano dalle RPC `SECURITY DEFINER`, che
girano con i privilegi del proprietario e applicano le regole di business.
Restano scrivibili dal browser solo i cataloghi, che la dashboard admin
modifica con insert/update dirette sotto la policy `admin_all`.

| Gruppo | Tabelle | Ospite | Admin |
|---|---|---|---|
| Mai dal browser | `admin_users`, `guest_credentials`, `guest_sessions`, `admin_sessions`, `login_attempts`, `spa_services_legacy`, viste `dashboard_stats`, `revenue_analytics`, `top_customers` | nessun accesso | nessun accesso (solo `service_role`) |
| Dati personali | `users` | solo la propria riga, in lettura | lettura; scrittura dalle RPC |
| Note interne | `guest_staff_notes` | nessun accesso | lettura; scrittura dalle RPC |
| Punti e attività | `user_points`, `game_scores`, `quiz_scores`, `point_transactions`, `challenge_completions`, `weekly_challenge_completions`, `user_rewards`, `user_push_subscriptions` | solo le proprie righe, in lettura | lettura; scrittura dalle RPC |
| Prenotazioni e pagamenti | `restaurant_bookings`, `tour_bookings`, `spa_bookings`, `payments`, `last_minute_purchases`, `stripe_customers` | solo le proprie, in lettura | lettura; scrittura dalle RPC e dal webhook Stripe (`service_role`) |
| Chat AI | `ai_conversations`, `ai_messages`, `ai_actions`, `ai_feedback` | solo le proprie conversazioni, in lettura | lettura; scrittura dalle RPC |
| Cataloghi | `tours`, `rewards`, `restaurant_menu`, `spa_treatments`, `flash_deals`, `last_minute_offers`, `hotel_settings`, `ui_sections`, `activities`, `rooms`, `weekly_challenges`, `daily_riddles`, `ai_knowledge_base` | sola lettura | scrittura diretta |
| Solo admin | `admin_audit_log`, `hotels`, `bookings`, `animation_bookings`, `lastminute_bookings`, `ai_analytics`, `photo_challenges` | nessun accesso | lettura; scrittura dalle RPC |

Il catalogo della spa è `spa_treatments`. La vecchia `spa_services` conteneva
una sola riga stantia che nella pagina spa sostituiva le card vere: è stata
rinominata `spa_services_legacy` e tolta dalla portata del browser.

Le classifiche passano dalle viste `leaderboard` e `game_leaderboard`, che non
espongono le email degli altri ospiti e restituiscono un flag `is_me`. Sono
visibili solo a un ospite autenticato o a un admin.

## Regole di business lato server

Queste RPC esistono perché la regola non può stare nel client:

- `award_points(p_game_id, p_score)`: i punti li calcola il server (1 ogni 10 di
  punteggio) con tetti di 50 per partita, 300 al giorno e 20 partite al giorno.
  Accetta solo i 19 identificativi di gioco realmente presenti nell'app.
- `submit_quiz(...)` e `complete_challenge(...)`: stesso principio, il
  punteggio arriva dal client ma il valore in punti lo decide il server.
- `redeem_reward(p_reward_id)`: in una sola transazione verifica punti e
  disponibilità, scala i punti, decrementa la giacenza e genera il codice.
- `create_booking(p_kind, p_payload)`: i prezzi vengono letti dal catalogo
  (`spa_treatments`, `tours`), non accettati dal client: `unit_price` nel
  payload viene considerato solo per il ristorante, che un catalogo di prezzi
  non ce l'ha. Lo sconto in punti vale 10 punti per euro, non può superare il
  totale e i punti vengono scalati nella stessa transazione. Con
  `payment_method = 'points'` i punti necessari li calcola il server sul prezzo
  di catalogo e, se non bastano, la prenotazione non viene creata
  (`INSUFFICIENT_POINTS`). Il metodo ammesso è `points`, `card` o `room`.
  Con `offer_id` il prezzo base diventa lo scontato di `last_minute_offers`:
  l'offerta deve essere attiva, nel suo periodo di validità, del tipo giusto e
  collegata al catalogo (`item_id`); il posto viene sottratto da
  `slots_available` con una guardia che impedisce l'overbooking
  (`OFFER_SOLD_OUT`, `OFFER_EXPIRED`) e l'acquisto finisce in
  `last_minute_purchases`.
- `get_my_rewards`, `cancel_booking`, `get_my_bookings`, `update_profile`,
  `save_push_subscription`, `log_ai_message`, `get_my_ai_history`,
  `submit_ai_feedback`: operano sempre e solo sulle righe dell'ospite che
  presenta il token.

## Segreti

- Nel repository non esiste nessuna chiave privata. Vedi `.env.example` per
  l'elenco delle variabili e dove configurarle.
- `SUPABASE_SERVICE_ROLE_KEY` scavalca la RLS: solo nelle Vercel Functions, mai
  nel browser. Vale lo stesso per `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `ANTHROPIC_API_KEY` e `RESEND_API_KEY`.
- La `anon key` e la publishable key Stripe (`pk_*`) sono pubbliche per
  definizione e possono stare nel sorgente.

## GDPR

- Dati personali trattati: cognome, email, numero di camera, PIN (solo hash),
  storico prenotazioni, punti, note interne dello staff.
- I pagamenti passano da Stripe: nel database non finiscono numeri di carta.
- Diritti dell'interessato: accesso da `account.html`, rettifica dal front desk,
  cancellazione da parte dell'admin.
- Da completare prima di trattare dati di ospiti reali:
  - [ ] conservazione: cancellazione automatica delle righe ospite 12 mesi dopo
        `stay_end_date`;
  - [ ] informativa privacy linkata **prima** della raccolta dei dati, nella
        schermata di registrazione;
  - [ ] backup PITR attivi su Supabase;
  - [ ] registro dei trattamenti e nomina di Supabase, Vercel, Stripe, Anthropic
        e Resend come responsabili del trattamento.

## Punti aperti

- [ ] Passaggio dell'area admin a Supabase Auth. Oggi non è praticabile: la
      registrazione pubblica è aperta, non c'è un server SMTP configurato,
      `site_url` punta ancora a `http://localhost:3000` e la lunghezza minima
      della password è 6. Servono, in quest'ordine: chiudere la registrazione
      pubblica, configurare SMTP e `site_url` sul dominio di produzione,
      creare gli utenti, valorizzare `admin_users.auth_user_id`. Solo dopo si
      possono rimuovere `admin_login`, `admin_sessions` e `x-admin-token`.
- [ ] Content Security Policy in `vercel.json`.
- [ ] Escape di tutto il contenuto dinamico inserito con `innerHTML`.
- [ ] Error tracking (Sentry o Vercel Observability).

## Checklist per ogni nuovo hotel

- [ ] Eseguire in ordine le migration di `supabase/migrations/` sul progetto Supabase del cliente.
- [ ] Verificare che nessuna tabella risulti senza RLS e che `anon` non abbia grant impliciti.
- [ ] Creare gli utenti Supabase Auth dello staff e le righe corrispondenti in `admin_users`.
- [ ] Configurare le variabili d'ambiente su Vercel (vedi `.env.example`).
- [ ] Sostituire le chiavi Stripe di test con quelle live.
- [ ] Popolare `hotel_settings` con i dati della struttura.
- [ ] Attivare i backup PITR.
- [ ] Collegare informativa privacy e cookie policy.
- [ ] Cancellare i dati di prova (ospiti e prenotazioni demo).
- [ ] Smoke test completo: registrazione, accesso con PIN, prenotazione, punti, riscatto premio, area admin.

## Segnalazioni

Segnala vulnerabilità o credenziali esposte in privato al manutentore, prima di
aprire una issue pubblica.
