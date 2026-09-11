# Pagamenti

GuestOS incassa con **Stripe Checkout**: la carta viene digitata su una pagina
ospitata da Stripe, mai dentro l'app. Il browser non tocca mai la tabella
`payments` — a scriverla è solo il webhook, dopo che Stripe ha confermato.

## Il giro completo

```
spa.html / tours.html / ristorante.html / lastminute.html
   │  create_booking  ──────────────►  prenotazione 'pending', prezzo deciso dal server
   ▼
payment-handler.js  ──►  POST /api/create-checkout-session
   │                          └─► crea la Session e restituisce session.url
   ▼
redirect sulla pagina di Stripe   ← qui l'ospite digita la carta
   │
   ├── paga ──► /payment-success.html?session_id=...
   └── annulla ──► torna alla pagina del servizio con ?canceled=true

                       nel frattempo, in parallelo:
Stripe ──► POST /api/stripe-webhook
              ├─ verifica la firma
              ├─ scrive in `payments` (idempotente sul payment_intent)
              └─ porta la prenotazione a 'confirmed' / payment_status 'paid'
```

Il punto da tenere a mente: **la conferma arriva dal webhook, non dal redirect**.
Un ospite che chiude il browser sulla pagina di Stripe dopo aver pagato viene
comunque registrato. E chi apre a mano `payment-success.html` non ottiene nulla.

## `/api/create-checkout-session`

`POST` JSON:

| campo | |
|---|---|
| `amount` | euro, da 1 a 2 000 |
| `itemType` | `tour`, `restaurant`, `spa`, `last_minute`, `room_service` |
| `itemName`, `itemDescription` | cosa compare sulla pagina Stripe |
| `userEmail`, `userName` | l'ospite |
| `bookingKind`, `bookingId` | la prenotazione da confermare (`restaurant`, `spa`, `tour`) |
| `metadata` | coppie extra, finiscono su Session e PaymentIntent |
| `cancelPath` | dove tornare in caso di annullamento |

Risponde `{ url, id }`: il client fa `window.location.href = url`.

Errori: `invalid_amount`, `invalid_item_type`, `invalid_email`,
`invalid_booking_kind`, `invalid_booking_id`, `rate_limited`,
`payments_not_configured` (manca `STRIPE_SECRET_KEY`).

## `/api/stripe-webhook`

Ascolta `checkout.session.completed` e `checkout.session.async_payment_succeeded`
(il secondo serve ai metodi che si saldano in differita).

- **Firma obbligatoria.** Senza `STRIPE_WEBHOOK_SECRET` valido risponde 400 e non
  scrive niente. Il body arriva grezzo (`bodyParser: false`): serve alla verifica.
- **Idempotente.** Prima di inserire controlla se quel `payment_intent` è già in
  `payments`. Stripe ritenta volentieri, e un doppio insert sarebbe un doppio incasso.
- **Errori transitori → 500.** Così Stripe ripassa più tardi; a proteggere dai
  doppioni ci pensa l'idempotenza.

Scrive con la service role key, quindi bypassa la RLS: è l'unico punto del
sistema che lo fa, ed è il motivo per cui `SUPABASE_SERVICE_ROLE_KEY` non deve
mai finire nel browser.

## Configurare Stripe

1. Dashboard Stripe → **Sviluppatori → Chiavi API**: copia la chiave segreta in
   `STRIPE_SECRET_KEY` (Vercel, non nel repo).
2. La chiave pubblicabile `pk_...` va in `config.js` (`STRIPE_CONFIG.publishableKey`).
   È pubblica per progetto: sta già nel sorgente di ogni pagina.
3. Dashboard → **Sviluppatori → Webhook** → aggiungi endpoint
   `https://<dominio>/api/stripe-webhook`, eventi `checkout.session.completed` e
   `checkout.session.async_payment_succeeded`. Copia il *signing secret* in
   `STRIPE_WEBHOOK_SECRET`.
4. `PUBLIC_BASE_URL` deve contenere il dominio pubblico: ci si costruiscono
   `success_url` e `cancel_url`.

### Prima del go-live

Le chiavi in repo sono di **test** (`pk_test_...`). Al passaggio in produzione
vanno sostituite entrambe — pubblicabile e segreta — e il webhook va ricreato:
il signing secret della modalità test non vale in quella live. Un webhook non
riconfigurato è il modo più comune di incassare senza confermare la prenotazione.

### Provare senza carte vere

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
stripe trigger checkout.session.completed
```

Carta di test: `4242 4242 4242 4242`, scadenza futura, CVC qualsiasi.

## Email di conferma

A prenotazione riuscita il client chiama `GuestOS.notifyBooking()`
(`booking-notify.js`) che fa `POST /api/send-confirmation`. Questa chiamata
**non fa mai fallire una prenotazione**: ha un timeout di 8 secondi e restituisce
sempre `{ sent, reason }`. Senza `RESEND_API_KEY` risponde
`{ sent: false, reason: 'mail_not_configured' }` con HTTP 200 — nessun errore
davanti all'ospite.

Env: `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_BCC_STAFF` (per la copia alla reception).

## Pagare con i punti

Non passa da Stripe. `create_booking` riceve `points_used`, applica il cambio
**10 punti = 1 euro** (mai oltre il totale) e scala il saldo con
`guestos_spend_points`. Se `payment_method` è `points` ma resta qualcosa da
pagare, la RPC solleva `INSUFFICIENT_POINTS`: non esiste un mezzo pagamento a punti.

`payment_method` vale `points`, `card` o `room` — il database lo vincola.
`room` significa addebito in camera: la prenotazione resta `pending` e la salda
la reception al check-out.

## Variabili d'ambiente

```
STRIPE_SECRET_KEY           sk_...   mai nel browser
STRIPE_WEBHOOK_SECRET       whsec_... mai nel browser
SUPABASE_SERVICE_ROLE_KEY   solo webhook, mai nel browser
PUBLIC_BASE_URL             https://...
RESEND_API_KEY, MAIL_FROM, MAIL_BCC_STAFF
```

Vedi `.env.example` per l'elenco completo.

## File

- `payment-handler.js` — `processPaymentWithCheckout()`, l'unico punto di ingresso
- `api/create-checkout-session.js`
- `api/stripe-webhook.js`
- `api/send-confirmation.js`, `booking-notify.js`, `lib/mail.js`
- `payment-success.html` — legge la riga in `payments`; se il webhook non è ancora
  passato mostra una conferma generica invece di un errore
