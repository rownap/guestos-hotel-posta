# GuestOS, stato del progetto

Aggiornato all'11 settembre 2026. Branch di lavoro: `hardening`.

Questo documento descrive lo stato reale dei lavori. Per la parte commerciale vedi
[`GUIDA_PRODOTTO.md`](GUIDA_PRODOTTO.md), per quella tecnica [`README.md`](README.md), per la
sicurezza [`SECURITY.md`](SECURITY.md).

## 1. Dove siamo

Il prodotto è in fase di consolidamento prima della prima consegna a una struttura reale. Non esiste
ancora alcun cliente pagante, quindi non ci sono dati storici d'uso.

| Voce | Stato |
|---|---|
| Frontend | Pagine statiche, nessun passo di compilazione |
| Database | Postgres su Supabase, RLS attiva su 44 tabelle |
| Funzioni serverless | Quattro: assistente, creazione pagamento, webhook pagamento, email |
| Assistente testuale | Collegato alla base di conoscenza, acceso solo con la chiave configurata |
| Pagamenti | Stripe Checkout, conferma scritta solo dal webhook, ancora in modalità di prova |
| Email | Resend, attive con chiave e mittente verificato |
| Deploy | Vercel, pubblicazione automatica al push |

## 2. Interventi di questo ciclo di lavoro

### 2.1 Sicurezza del database

Row Level Security attivata su tutte le tabelle raggiungibili dal browser, con policy esplicite
tabella per tabella. Revocati i privilegi impliciti del ruolo `anon`, incluse le autorizzazioni
predefinite per le tabelle future.

Verifica da anonimo: nessuna riga visibile in `users`, `user_points`, `payments`, `restaurant_bookings`,
`spa_bookings`, `tour_bookings`, `user_rewards`, `game_scores`. Le tabelle `admin_users`,
`guest_credentials`, `guest_sessions` e `admin_sessions` rispondono con errore di permesso. Restano
leggibili, come previsto, solo i cataloghi pubblici.

Eliminate due colonne che esponevano dati sensibili: `users.pin`, sostituita dall'hash bcrypt in
`guest_credentials`, e `users.staff_notes`, spostata in `guest_staff_notes`, non leggibile dal
browser.

### 2.2 Sessioni con token

Accesso e registrazione dell'ospite passano solo da funzioni `SECURITY DEFINER`. L'accesso riuscito
crea una riga in `guest_sessions` e restituisce un token UUID con scadenza a trenta giorni.

Il token viaggia come parametro `p_token` della chiamata oppure nell'header `x-guest-token`, impostato
automaticamente da `config.js`. Vale solo se la sessione non è scaduta, l'ospite è attivo e il
soggiorno non è terminato: la disattivazione da parte dello staff ha effetto immediato.

Il conteggio dei tentativi di accesso falliti è passato dal browser al server, nella tabella
`login_attempts`: cinque errori sulla stessa camera bloccano per dieci minuti. Il contatore
precedente stava in `localStorage` ed era aggirabile svuotandolo.

Il PIN esiste solo come hash. Non è più leggibile da nessuno, staff incluso: la console può solo
rigenerarlo con `admin_reset_guest_pin`, che invalida le sessioni attive di quell'ospite e mostra il
nuovo PIN una volta sola.

### 2.3 Punti calcolati dal server

`award_points` assegna un punto ogni dieci di punteggio, con tetto di cinquanta punti per partita,
trecento al giorno e venti partite al giorno. Il client non decide più quanti punti valga una partita.

`redeem_reward` verifica punti e disponibilità, scala i punti, decrementa la giacenza e genera il
codice del premio in un'unica transazione.

Le classifiche passano dalle viste `leaderboard` e `game_leaderboard`, che non espongono le email
degli altri ospiti e restituiscono il flag `is_me`. Sono visibili solo a un ospite autenticato o a un
membro dello staff.

### 2.4 Assistente collegato alla base di conoscenza

`api/chat.js` costruisce il prompt di sistema leggendo `hotel_settings` e le voci attive di
`ai_knowledge_base`, con cache in memoria di centoventi secondi e un tetto di dodicimila caratteri
sulla base di conoscenza.

Aggiunti un limite di trenta messaggi ogni dieci minuti per indirizzo IP, un timeout di venticinque
secondi sulla chiamata al modello e il ripiego a parole chiave in tutti i casi di errore: chiave
assente, errore del fornitore, timeout, risposta vuota. L'ospite non vede mai un errore tecnico.

### 2.5 Pagamenti con conferma dal server

Il percorso con elemento di pagamento nella pagina è stato rimosso. Resta solo Stripe Checkout: il
browser chiede a `api/create-checkout-session.js` di creare la sessione e viene rediretto su Stripe.

La conferma la scrive solo `api/stripe-webhook.js`, dopo avere verificato la firma dell'evento. Il
webhook inserisce la riga in `payments` in modo idempotente sull'identificativo dell'intento di
pagamento, aggiorna la prenotazione collegata e invia l'email. Il browser non scrive nulla: con la RLS
attiva non potrebbe comunque.

La creazione della sessione valida importo, tipo di servizio e percorso di ritorno in caso di
annullamento, accetta solo richieste dalla stessa origine e applica un limite di venti richieste al
minuto per indirizzo IP.

### 2.6 Email di conferma

Nuovo modulo `lib/mail.js` e funzione `api/send-confirmation.js`, chiamata da `booking-notify.js`
dopo le prenotazioni pagate con punti o addebitate in camera. Le prenotazioni pagate con carta
ricevono l'email dal webhook.

Se la chiave Resend manca, la funzione risponde `mail_not_configured` senza errore: la prenotazione
resta valida e visibile in console. Opzionale la copia nascosta allo staff.

### 2.7 Service worker unico

Un solo `service-worker.js`, versione cache `guestos-v2`, che all'attivazione elimina le cache
precedenti. Navigazioni HTML con strategia rete prima, poi cache, poi pagina di cortesia; asset
statici con cache prima.

Non intercetta nulla verso Supabase, Stripe, Anthropic, il widget meteo e `/api/`, né alcuna richiesta
diversa da GET. Il precaricamento è tollerante: un file mancante non blocca più l'installazione, che
era il motivo per cui il service worker precedente non si installava.

Conseguenza da ricordare nella comunicazione commerciale: le pagine già visitate restano consultabili
senza rete, ma non esiste nessuna coda che invii le prenotazioni al rientro online.

### 2.8 Informativa privacy

Scritta `privacy.html`, collegata dalla pagina di registrazione prima della raccolta dei dati, con
riscrittura `/privacy` in `vercel.json`. Indica dati trattati, base giuridica, fornitori coinvolti,
tempi di conservazione e come esercitare i diritti.

### 2.9 Altri interventi

- Header di sicurezza in `vercel.json`: `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy` su tutto il sito, più `X-Frame-Options`, `Cache-Control: no-store` e
  `X-Robots-Tag: noindex` sulle pagine di amministrazione.
- `.env.example` riscritto, con le dieci variabili e il comportamento dell'app quando ognuna manca.
- Registro delle operazioni sensibili dello staff in `admin_audit_log`.
- Pagine migrate al nuovo modello: `login.html`, `account.html`, `rewards.html`, `games.html`,
  `leaderboard.html`, `chat.html`, `lastminute.html`, `bottom-nav.html`,
  `guestos-admin-login.html`, `guestos-admin-features.js`.
- Documentazione: `SECURITY.md`, `README.md`, `GUIDA_PRODOTTO.md`, `docs/DEPLOY.md`, `docs/AI.md`,
  `docs/PAYMENTS.md`.
- Rimossi dalla documentazione pubblica i numeri di risultato non misurati. Vedi punto 5.

## 3. Cosa resta aperto, in ordine di priorità

### Bloccante prima di consegnare a un cliente reale

1. **Tre pagine di prenotazione non ancora migrate.** `ristorante.html`, `spa.html` e `tours.html`
   inseriscono ancora direttamente nelle tabelle di prenotazione e non usano `GuestOS.rpc`. Con la RLS
   attiva il percorso va verificato riga per riga e portato su `create_booking`. Stesso controllo per
   `quiz.html` e `community-board.html`.
2. **Funzioni ancora mancanti sul database**, richieste dal client già scritto: `create_booking`,
   `cancel_booking`, `get_my_bookings`, `get_my_rewards`, `update_profile`, `get_leaderboard`,
   `admin_me`. In carico alla sessione che possiede le migrazioni.
3. **Scrittura diretta della colonna `points`.** Un ospite autenticato può ancora aggiornare i propri
   punti con una chiamata diretta. Non espone dati di altri, ma consente di gonfiare il punteggio. Va
   revocato il privilegio di aggiornamento su quella colonna, ma solo dopo avere spostato su funzioni
   server gli ultimi punti di scrittura diretta: `points-helper.js`, `quiz.html`, `games.html`,
   `community-board.html`, `riddle-of-day.html`, `weekly-challenge.html`.
4. **Chiavi Stripe di produzione.** In `config.js` c'è ancora una publishable key di prova. Vanno
   messe le chiavi della struttura e registrato l'endpoint webhook sul dominio definitivo.
5. **Schema di base non versionato.** Il repository contiene solo tre migrazioni; le tabelle di dati e
   i cataloghi sono stati creati direttamente in Supabase Studio. Senza un dump dello schema come
   passo zero, un progetto nuovo non si può ricostruire. Vedi [`docs/DEPLOY.md`](docs/DEPLOY.md).
6. **`ai_resolve_guest` disallineata.** In `supabase/migrations/004_ai.sql` la funzione risolve il
   token leggendo `users.session_token`, colonna del modello di sessione precedente. Dopo il blocco di
   sicurezza le sessioni vivono in `guest_sessions`: la cronologia dell'assistente va provata e, se
   non scrive, la funzione va riallineata a `guestos_resolve_guest`.
7. **Adempimenti sui dati personali**: cancellazione automatica delle righe ospite dopo la scadenza
   del periodo di conservazione, backup a ripristino puntuale attivi, registro dei trattamenti e
   nomina di Supabase, Vercel, Stripe, Anthropic e Resend come responsabili del trattamento.
8. **Dominio dell'assistente.** Il dominio principale della struttura risponde con errore
   sull'indirizzo dell'assistente perché punta a una pubblicazione diversa da quella del progetto. Va
   riallineato nelle impostazioni del dominio. Vedi [`docs/AI.md`](docs/AI.md).
9. **Cancellazione dei dati di prova** prima della consegna: ospiti, prenotazioni e pagamenti di test.

### Importante, non bloccante

10. Completare il passaggio dell'area di amministrazione a Supabase Auth, poi rimuovere `admin_login`,
    `admin_sessions` e l'header `x-admin-token`.
11. Content Security Policy in `vercel.json`.
12. Passare per `escapeHtml` tutto il contenuto dinamico inserito con `innerHTML` nelle pagine non
    ancora riviste.
13. Tracciamento degli errori lato server, per sapere quando una funzione serverless va in errore in
    produzione.
14. Invio delle notifiche push dal server. La parte sul telefono e la tabella delle iscrizioni
    esistono, manca l'invio.
15. Prova di carico sul percorso di prenotazione: non è mai stata fatta.

### Da fare quando c'è un cliente

16. Versione multilingua. Oggi i testi stanno dentro il codice in oltre cinquanta file, senza alcun
    meccanismo di traduzione.
17. Modulo ristoranti a turni per la fascia Villaggio.
18. Misurazione dell'uso reale: quanti ospiti si registrano, quanti installano l'app, quante
    prenotazioni arrivano dall'app, quante richieste in meno riceve la reception. Sono i numeri che
    oggi non abbiamo e che servono per il primo caso studio.
19. Esportazione dei dati della struttura in formato leggibile, da mostrare prima della firma come
    garanzia contro il blocco del fornitore.

## 4. Configurazione, stato delle chiavi

| Variabile | Stato | Effetto se manca |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | configurate | Le funzioni non leggono i cataloghi |
| `SUPABASE_SERVICE_ROLE_KEY` | da configurare per i pagamenti | Il webhook non conferma le prenotazioni |
| `ANTHROPIC_API_KEY` | da configurare | Assistente in modalità base a parole chiave |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | di prova | Nessun pagamento reale |
| `RESEND_API_KEY`, `MAIL_FROM` | da configurare | Nessuna email di conferma |
| `MAIL_BCC_STAFF` | opzionale | Lo staff non riceve copia |
| `PUBLIC_BASE_URL` | da configurare | Indirizzi di ritorno dopo il pagamento meno affidabili |

## 5. Nota sulla documentazione commerciale

`GUIDA_PRODOTTO.md` conteneva risultati presentati come misurati che non sono mai stati misurati:
aumenti percentuali delle prenotazioni, quota di ospiti che apre l'app, tempo di rientro
dell'investimento, ritorno sull'investimento, una tabella di riferimento di settore senza fonte.

Sono stati eliminati e sostituiti con uno scenario dichiarato come tale: assunzioni in chiaro, formula
per rifare il conto con i numeri veri della struttura e punto di pareggio espresso in numero di
vendite aggiuntive, che dipende solo dal prezzo di GuestOS e dal margine del cliente.

Regola per il futuro: nessuna percentuale di risultato nella documentazione fino al primo caso studio
dopo una stagione completa.
