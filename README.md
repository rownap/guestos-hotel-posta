# GuestOS

App web per gli ospiti di un hotel o di un villaggio, con console di gestione per lo staff.
Frontend statico, database Postgres su Supabase, quattro funzioni serverless su Vercel.

- Guida commerciale e funzionale: [`GUIDA_PRODOTTO.md`](GUIDA_PRODOTTO.md)
- Modello di sicurezza: [`SECURITY.md`](SECURITY.md)
- Stato dei lavori: [`stato_progetto_guestos.md`](stato_progetto_guestos.md)
- Messa in opera di una nuova struttura: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- Assistente testuale: [`docs/AI.md`](docs/AI.md)
- Pagamenti: [`docs/PAYMENTS.md`](docs/PAYMENTS.md)

## Cosa fa

Lato ospite: registrazione con numero di camera, cognome e PIN a sei cifre; prenotazione di
ristorante, centro benessere ed escursioni; pagamento con punti, addebito in camera o carta; punti e
premi con minigiochi e classifiche; offerte a tempo; assistente testuale; installazione sulla
schermata Home come PWA.

Lato staff: elenco dei soggiorni attivi, gestione delle prenotazioni, correzione dei punti, consegna
dei premi, rigenerazione del PIN, pubblicazione delle offerte a tempo, modifica dei contenuti,
statistiche, base di conoscenza dell'assistente.

## Architettura

### Frontend

Pagine HTML statiche, CSS e JavaScript senza moduli. Nessun passo di compilazione, nessun bundler,
nessun framework. Un file `.html` per pagina, gli script inclusi con tag `<script>`. Il deploy
pubblica i file così come sono.

File trasversali:

| File | Ruolo |
|---|---|
| `config.js` | Crea il client Supabase e aggiunge a ogni richiesta gli header `x-guest-token` e `x-admin-token` letti da `localStorage`. Va incluso per primo. |
| `guest-session.js` | Espone `window.GuestOS`: sessione ospite, `GuestOS.rpc(nome, params)`, punti, `escapeHtml`, logout. Va incluso subito dopo `config.js`. |
| `booking-notify.js` | Chiama `/api/send-confirmation` dopo una prenotazione andata a buon fine. |
| `payment-handler.js` | Crea la sessione di pagamento e redirige su Stripe. |
| `app.js` | Navigazione e registrazione del service worker. |
| `service-worker.js` | Unico service worker: cache delle pagine e degli asset, gestione delle notifiche push. |
| `common.css` | Stili condivisi. |

### Funzioni serverless

Quattro funzioni in `api/`, runtime Node, nessun framework. Sono le sole parti del sistema che vedono
una chiave segreta.

| Endpoint | Cosa fa |
|---|---|
| `api/chat.js` | Assistente testuale. Costruisce il prompt di sistema da `hotel_settings` e `ai_knowledge_base`, chiama Anthropic, applica un limite di trenta messaggi ogni dieci minuti per IP. Senza `ANTHROPIC_API_KEY` risponde con il ripiego a parole chiave. |
| `api/create-checkout-session.js` | Crea la sessione di pagamento Stripe e restituisce l'URL. Valida importo, tipo di servizio e percorso di annullamento; accetta solo richieste dalla stessa origine. |
| `api/stripe-webhook.js` | Riceve gli eventi Stripe, verifica la firma, scrive la riga in `payments` in modo idempotente, conferma la prenotazione collegata, invia l'email. È l'unico punto che marca un pagamento come riuscito. |
| `api/send-confirmation.js` | Invia l'email di conferma per le prenotazioni pagate con punti o addebitate in camera. |

Tre moduli condivisi in `lib/`: `http.js` (controllo di origine, limite di richieste, validazioni),
`supabase-admin.js` (accesso al database con la chiave di servizio), `mail.js` (invio via Resend e
composizione dei messaggi).

### Database

Postgres su Supabase. Il browser parla direttamente con PostgREST: non esiste un backend che filtri
le richieste, quindi il confine di sicurezza è il database stesso.

- Row Level Security attiva su tutte le tabelle raggiungibili dal browser, con policy esplicite per
  tabella. Nessun privilegio implicito per il ruolo `anon`.
- Ogni operazione sensibile passa da una funzione `SECURITY DEFINER` (RPC): accesso, registrazione,
  assegnazione punti, riscatto premi, creazione e annullamento prenotazioni, operazioni di staff. Il
  client non scrive mai direttamente sulle tabelle di dati personali.
- L'identità dell'ospite è un token UUID in `guest_sessions`, passato come parametro `p_token` della
  RPC oppure nell'header `x-guest-token`. Scade dopo trenta giorni e decade subito se lo staff
  disattiva il soggiorno.
- Il PIN dell'ospite esiste solo come hash bcrypt in `guest_credentials`, tabella non leggibile dal
  browser. Dopo la generazione nessuno può rileggerlo, si può solo rigenerarlo.
- Il server ricalcola prezzi, sconti e punti. Il client mostra una stima e poi usa il valore
  restituito.
- I tentativi di accesso falliti sono contati sul server in `login_attempts`: cinque errori bloccano
  per dieci minuti.

Il dettaglio per tabella e per ruolo sta in [`SECURITY.md`](SECURITY.md).

### Servizi esterni

| Servizio | A cosa serve | Obbligatorio |
|---|---|---|
| Supabase | Database, PostgREST, RPC | sì |
| Vercel | Hosting statico e funzioni serverless | sì |
| Anthropic | Risposte dell'assistente | no |
| Stripe | Pagamenti con carta | no |
| Resend | Email di conferma | no |
| weatherwidget.io | Riquadro meteo in home | no |

## Avvio in locale

Serve Node 18 o superiore.

```bash
git clone <url-del-repository>
cd guestos-hotel-posta
npm install          # solo le dipendenze server: stripe, resend
cp .env.example .env.local
# compila .env.local, almeno SUPABASE_URL e SUPABASE_ANON_KEY
```

Due modi di avviare.

Con le funzioni serverless attive, necessario per provare assistente, pagamenti ed email:

```bash
npx vercel dev
# apre http://localhost:3000, legge .env.local
```

Solo frontend, senza funzioni (le chiamate a `/api/...` danno 404):

```bash
npx serve .
# apre http://localhost:3000
```

Il database resta quello remoto indicato in `config.js`. Non esiste un database locale: prima di
lavorare in locale su dati veri, puntare `config.js` a un progetto Supabase di prova.

## Migrazioni, ordine di esecuzione

Le migrazioni stanno in `supabase/migrations/` e si eseguono dall'editor SQL di Supabase Studio,
incollandole una per volta. Sono idempotenti: rieseguirle non rompe nulla.

| Ordine | File | Cosa fa |
|---|---|---|
| 0 | schema di base | Tabelle di dati e cataloghi (`users`, `user_points`, i tre `*_bookings`, `rewards`, `tours`, `spa_services`, `restaurant_menu`, le tabelle `ai_*`, e le altre). **Non è versionato in questo repository**: è stato creato direttamente in Supabase Studio. Vedi la nota qui sotto. |
| 1 | `20260910120000_security_lockdown.sql` | Attiva RLS su tutte le tabelle, crea `guest_sessions`, `admin_sessions`, `guest_credentials`, `login_attempts`, `is_admin()`, le RPC di accesso, sposta i PIN su hash bcrypt. |
| 2 | `20260910180000_converge_token_contract.sql` | Token in formato UUID accettato come parametro o come header, RPC ospite e staff aggiuntive, `hotel_settings`. |
| 3 | `004_ai.sql` | Tabelle di collegamento e RPC per la cronologia dell'assistente. Va eseguita **per ultima** nonostante il prefisso numerico, perché usa `is_admin()` creata al passo 1. |

Due avvertenze da leggere prima di usare queste migrazioni su un progetto nuovo.

1. Lo schema di base non è nel repository. `db-setup.sql` nella radice copre solo il trigger che crea
   la riga `user_points` alla registrazione di un ospite, non l'intero schema. Per una nuova struttura
   serve prima esportare lo schema dal progetto esistente (`supabase db dump --schema public`) e
   applicarlo come passo 0. Vedi [`docs/DEPLOY.md`](docs/DEPLOY.md).
2. `004_ai.sql` risolve il token ospite leggendo `users.session_token`, colonna del modello di
   sessione precedente al passo 1. Dopo il passo 1 le sessioni vivono in `guest_sessions`, quindi la
   cronologia dell'assistente va verificata e la funzione `ai_resolve_guest` probabilmente va
   riallineata. Punto aperto, vedi [`stato_progetto_guestos.md`](stato_progetto_guestos.md).

## Variabili d'ambiente

Dieci variabili, tutte elencate in [`.env.example`](.env.example). In locale vanno in `.env.local`, in
produzione in Vercel, Project Settings, Environment Variables. Nessuna di queste deve finire nel
repository.

| Variabile | Obbligatoria | A cosa serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | no | Chiave da console.anthropic.com, usata da `api/chat.js` per le risposte dell'assistente. Se manca, la chat risponde in modalità base per parole chiave: l'app non si rompe e l'ospite non vede errori. |
| `SUPABASE_URL` | sì | URL del progetto Supabase, nella forma `https://<ref>.supabase.co`. Lo usano le funzioni serverless per leggere e scrivere via PostgREST. Senza, il webhook dei pagamenti non riesce a confermare la prenotazione. |
| `SUPABASE_ANON_KEY` | sì | Chiave pubblica del progetto, la stessa che sta in `config.js`. Le funzioni la usano per leggere i cataloghi pubblici, che sono in sola lettura anche per un anonimo. Non è un segreto. |
| `SUPABASE_SERVICE_ROLE_KEY` | sì se si usano i pagamenti | Chiave di servizio: scavalca la Row Level Security. Serve al webhook Stripe per scrivere in `payments` e confermare la prenotazione. Solo lato server, mai nel browser, mai in una pagina HTML. |
| `STRIPE_SECRET_KEY` | no | Chiave segreta Stripe, `sk_test_...` in prova e `sk_live_...` in produzione. Senza, `api/create-checkout-session.js` risponde 503 e il pulsante di pagamento dice che il pagamento online non è disponibile. |
| `STRIPE_WEBHOOK_SECRET` | no, ma necessaria con i pagamenti attivi | Segreto dell'endpoint webhook, generato da Stripe quando si registra `https://<dominio>/api/stripe-webhook`. Serve a verificare la firma degli eventi. Senza, il webhook rifiuta tutto e i pagamenti riusciti non vengono mai confermati sul database. |
| `RESEND_API_KEY` | no | Chiave Resend per l'invio delle email di conferma. Se manca, la prenotazione resta valida e visibile in console, semplicemente l'email non parte e la funzione risponde `mail_not_configured`. |
| `MAIL_FROM` | no, ma necessaria con le email attive | Mittente verificato sul dominio della struttura, per esempio `Hotel Posta <no-reply@hotelposta.it>`. Un mittente non verificato su Resend fa rifiutare l'invio. |
| `MAIL_BCC_STAFF` | no | Uno o più indirizzi separati da virgola che ricevono in copia nascosta ogni conferma inviata all'ospite. Serve alla reception per avere traccia in casella. |
| `PUBLIC_BASE_URL` | consigliata | URL pubblico dell'app senza slash finale, per esempio `https://app.hotelposta.it`. Serve a costruire gli indirizzi di ritorno dopo il pagamento. Se manca, le funzioni provano a ricavarlo dagli header della richiesta: funziona, ma è meno affidabile dietro a un dominio personalizzato. |

Tre valori pubblici per definizione non sono variabili d'ambiente e stanno nel codice: la anon key di
Supabase e l'URL del progetto in `config.js`, e la publishable key di Stripe (`pk_...`) nello stesso
file. Sono visibili nel sorgente di ogni pagina e non danno accesso a nessun dato: quello lo decide la
Row Level Security.

## Stato verificato

Verificato l'11 settembre 2026 sul database di produzione e sul codice del branch `hardening`.

### Funziona senza configurazione aggiuntiva

- Row Level Security attiva su 44 tabelle. Da anonimo non è visibile nessuna riga di `users`,
  `user_points`, `payments`, `*_bookings`, `user_rewards`, `game_scores`; `admin_users`,
  `guest_credentials`, `guest_sessions` e `admin_sessions` rispondono con errore di permesso.
- Cataloghi leggibili da anonimo, come previsto: premi, escursioni, trattamenti, menu, programma
  animazione, offerte, impostazioni della struttura.
- Registrazione, accesso e uscita dell'ospite via RPC, con PIN salvato come hash bcrypt.
- Sessioni con token UUID in `guest_sessions`, accettato come parametro o come header.
- Punti assegnati dal server con tetti per partita e per giornata.
- Riscatto premi con verifica di punti e disponibilità nella stessa transazione.
- Classifiche dalle viste `leaderboard` e `game_leaderboard`, senza email degli altri ospiti.
- Blocco dei tentativi di accesso lato server.
- Accesso staff e operazioni sensibili con registro in `admin_audit_log`.
- Un solo service worker, con bypass delle chiamate a Supabase, Stripe e `/api/`.
- Informativa privacy in `privacy.html`, collegata dalla pagina di registrazione.
- Tutte le pagine migrate passano `node --check` sui blocchi di script.

### Richiede una configurazione per funzionare

| Funzione | Cosa serve | Comportamento senza |
|---|---|---|
| Assistente testuale | `ANTHROPIC_API_KEY` | Ripiego a parole chiave, nessun errore visibile. |
| Pagamento con carta | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, endpoint webhook registrato su Stripe | 503 e messaggio di indisponibilità; punti e addebito in camera restano. |
| Email di conferma | `RESEND_API_KEY`, `MAIL_FROM`, dominio verificato su Resend | Prenotazione valida, email non inviata. |
| Pagamenti reali | Sostituire in `config.js` la publishable key di prova con la `pk_live_` della struttura | Si paga in modalità di prova: nessun incasso reale. |
| Notifiche push | Invio dal server, non implementato | La parte sul telefono esiste, non parte nessuna notifica. |

### Punti aperti

Elenco completo e ordinato in [`stato_progetto_guestos.md`](stato_progetto_guestos.md).

## Struttura del repository

```
.
├── index.html, login.html, account.html, ...   pagine ospite
├── ristorante.html, spa.html, tours.html       prenotazione servizi
├── games.html + 19 file gioco                  minigiochi
├── guestos-admin-login.html                    accesso staff
├── guestos-admin-dashboard.html                console di gestione
├── config.js, guest-session.js                 sessione e client database
├── booking-notify.js, payment-handler.js       prenotazioni e pagamenti
├── app.js, service-worker.js, manifest.json    PWA
├── api/                                        funzioni serverless
├── lib/                                        moduli condivisi delle funzioni
├── supabase/migrations/                        migrazioni del database
├── docs/                                       deploy, assistente, pagamenti
└── vercel.json                                 riscritture URL e header di sicurezza
```

## Licenza e uso

Repository a uso interno di RC Studio. Il codice non è rilasciato con licenza aperta.
Per segnalazioni di sicurezza vedi [`SECURITY.md`](SECURITY.md).
