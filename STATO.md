# Stato del progetto — 11 settembre 2026

Documento di passaggio. Se sei un agente che riprende il lavoro, **leggi questo
prima di toccare qualsiasi cosa**: descrive dove siamo, cosa è già stato fatto e
quali sono le tre regole che non vanno violate.

---

## 1. La cosa che blocca tutto

**Il progetto Vercel non è collegato al repository GitHub.**

Verificato: `gh api repos/rownap/guestos-hotel-posta/deployments` restituisce
`[]`, e il repo non ha webhook. Nessun push ha mai prodotto un deploy.

Conseguenza: il sito su `guestos-hotel-posta.vercel.app` serve una build vecchia
caricata a mano, mentre il database è stato messo in sicurezza. La build online
fa **0 chiamate RPC** e **29 accessi diretti alle tabelle**, di cui 11 in
scrittura: tutte rifiutate con `permission denied`. Per un ospite l'app online
oggi non funziona affatto.

**Non provare a risolverlo da codice.** È un'azione nelle impostazioni del
progetto Vercel che deve fare Roberto (Settings → Git → Connect Git Repository).
Il CLI Vercel su questa macchina non è autorizzato.

Finché non è collegato, ogni verifica va fatta in locale:

```bash
python3 -m http.server 8080
```

---

## 2. Divisione del lavoro fra sessioni

Due sessioni Claude lavorano sullo stesso progetto:

| | Possiede |
|---|---|
| **Sessione client** (questa) | Tutti gli `.html`, `.js`, `api/`, `lib/`, `docs/` |
| **Sessione database** | `supabase/`, le RPC, le policy RLS, i dati |

**Regole in vigore, da rispettare:**

1. **Mai scrivere sul database di produzione** al di fuori delle RPC normali
   dell'applicazione. Le letture con la anon key vanno bene. Non creare, modificare
   o cancellare niente sotto `supabase/migrations/`: è dell'altra sessione.
2. **Mai committare o pushare senza che Roberto lo chieda.** Non cambiare branch
   da solo.
3. **Le chiavi segrete** (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`) stanno solo
   nelle variabili d'ambiente Vercel e non devono mai arrivare al browser. La
   anon key di Supabase e la `pk_` di Stripe sono pubbliche per progetto: quelle
   nel sorgente ci stanno bene.

---

## 3. Com'è fatto adesso

### Il contratto fra browser e database

Il browser **non scrive su nessuna tabella con dati dell'ospite**. I privilegi di
`INSERT`/`UPDATE`/`DELETE` per `anon` e `authenticated` sono revocati. Ogni
modifica passa da una RPC `SECURITY DEFINER`, che applica le regole di business.

Restano scrivibili dal browser solo i **cataloghi** (`tours`, `rewards`,
`restaurant_menu`, `spa_treatments`, `flash_deals`, `last_minute_offers`,
`animation_activities`, `ai_knowledge_base`, `hotel_settings`), e solo con un
`x-admin-token` valido, che fa passare la policy `admin_all`.

Identità:

- **Ospite**: token in `localStorage.guestos_token`. `guest-session.js` lo inietta
  come `p_token` in ogni RPC; `config.js` lo manda anche come header
  `x-guest-token` per le letture dirette.
- **Admin**: token in `localStorage.guestos_admin_token`, header `x-admin-token`.
  Non è Supabase Auth: sono righe in `admin_sessions`, 24 ore di validità.

### File centrali

| File | Cosa fa |
|---|---|
| `guest-session.js` | `window.GuestOS`: token, login, `rpc()` con `p_token` automatico, `awardPoints`, traduzione dei codici d'errore in italiano |
| `config.js` | Client Supabase con gli header di sessione. **Va caricato DOPO la libreria Supabase** |
| `points-helper.js` | Wrapper sottile su `GuestOS.awardPoints` |
| `app-data-loader.js` | Riempie le griglie dai cataloghi. Legge `spa_treatments`, **non** `spa_services` |
| `admin-content-manager.js` | Gestione contenuti: select/insert dirette sotto `admin_all` |
| `guestos-flash-deals.js` | Offerte lampo, stesso schema |
| `booking-notify.js` | Email di conferma. **Non fallisce mai** una prenotazione |
| `payment-handler.js` | Solo `processPaymentWithCheckout()` |

Ordine degli script nelle pagine — **conta**:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
<script src="guest-session.js"></script>
```

### Prenotazioni

`create_booking(p_kind, p_payload, p_token)`. Il prezzo lo decide **sempre** il
server: mandare `unit_price` su spa e tour non serve, viene ignorato.

| Tipo | Campo obbligatorio |
|---|---|
| `spa` | `treatment_id` (intero → `spa_treatments`) |
| `tour` | `tour_id` (→ `tours`) |
| `restaurant` | `original_price` (non c'è catalogo prezzi) |
| offerta last minute | `offer_id` — il prezzo diventa lo scontato e i posti calano |

`payment_method` vale solo `points`, `card` o `room`. Con `points` il server
calcola da sé i punti necessari (10 punti = 1 euro) e solleva
`INSUFFICIENT_POINTS` se non bastano.

### Punti

Solo `award_points(p_game_id, p_score)`, con i tetti del server: 50 a partita,
300 al giorno, 20 partite al giorno. Tutti e 19 i giochi la usano.
`submit_quiz` per il quiz, `complete_challenge` per le sfide community.

---

## 4. Cosa è stato fatto l'11 settembre

- Riparate **tutte e quattro** le prenotazioni: spa e tour non mandavano l'id di
  catalogo, il ristorante mandava il prezzo nel campo sbagliato
- Offerte last minute prenotabili al prezzo scontato (prima l'ospite vedeva 39 €
  e avrebbe pagato 55)
- Sostituite **sei RPC admin mai esistite** con accesso diretto: gestione
  contenuti e offerte lampo erano sezioni morte
- Chiusa una XSS nella classifica (il nome dell'ospite finiva in `innerHTML`)
- `app-data-loader.js` leggeva `spa_services` — una riga stantia — e con quella
  sostituiva le cinque card vere della pagina spa
- `games.html` aveva un listino premi scritto a mano e disallineato su ogni riga
- Rimossa la chiamata a una Edge Function `generate-embedding` mai esistita
- `payment-success.html` caricava `config.js` prima della libreria Supabase
- Il webhook Stripe non scriveva `payment_status` sulle prenotazioni spa
- Scritti `docs/AI.md`, `docs/PAYMENTS.md`, `docs/ADMIN_SETUP.md`

Verificato end-to-end contro la produzione, coi payload esatti delle pagine:
massaggio per due 136 €, escursione per due 110 €, cena 35 €, offerta last
minute per due 78 € invece di 110 con i posti da 10 a 8. Tutte poi annullate.

---

## 5. Cosa manca, in ordine di valore

1. **Multi-struttura.** `«Hotel Posta»` è scritto nel codice **43 volte**, in 38
   titoli di pagina, e le impostazioni leggono sempre `hotel_settings` con
   `id = 1`. Oggi il secondo hotel richiede una copia del progetto. È il singolo
   intervento che sposta di più il valore. Circa due settimane.
2. **Notifiche push a metà.** Le iscrizioni si salvano in
   `user_push_subscriptions`, ma **non esiste niente che le invii**. Serve una
   Vercel Function con `web-push` e la chiave VAPID privata.
3. **Nessun lavoro schedulato.** Le offerte lampo scadono solo se un admin tiene
   la dashboard aperta. Serve una voce `crons` in `vercel.json`.
4. **Nessun test, nessuna CI**, su 36.000 righe.
5. **Listino premi da decidere.** C'erano due listini sovrapposti; è stato tenuto
   il più economico. Quanto deve costare un premio in punti è una scelta
   commerciale di Roberto, non tecnica.
6. **Interfaccia grezza in alcuni punti**: una settantina di `alert()` nativi, e
   2 dei 12 campi delle impostazioni non vengono salvati dal server (sono
   marcati come tali nel pannello).

---

## 6. Come provare

Ospiti dimostrativi con soggiorno in corso fino al 31/12:

| Camera | Cognome | PIN |
|---|---|---|
| 101 | Rossi | 246813 |
| 205 | Bianchi | 135792 |

Sono account finti sul database di prova. Se i PIN non funzionano più, si
rigenerano con `admin_reset_guest_pin` (vedi `docs/ADMIN_SETUP.md`).

Verifiche rapide prima di dire che qualcosa funziona:

```bash
# sintassi di tutti i JS
for f in *.js api/*.js lib/*.js; do node --check "$f" || echo "ROTTO: $f"; done

# RPC chiamate dal client ma non definite: deve essere vuoto
grep -rhoE "rpc\('[a-z_]+'" --include='*.html' --include='*.js' . | sed "s/rpc('//;s/'//" | sort -u > /tmp/a
grep -rhoiE "create (or replace )?function public\.[a-z_]+" supabase/migrations/*.sql | sed 's/.*public\.//' | tr 'A-Z' 'a-z' | sort -u > /tmp/b
comm -23 /tmp/a /tmp/b
```

**Attenzione a come si verifica un privilegio revocato.** Un `PATCH` con corpo
`{}` risponde `204` su qualunque tabella leggibile, perché senza colonne da
scrivere il privilegio di scrittura non viene mai richiesto. Il test valido usa
una colonna vera:

```bash
curl -X PATCH "$URL/rest/v1/user_points?user_email=eq.inesistente@x.y" \
  -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"points":1}'
# atteso: 401 permission denied
```

---

## 7. Documentazione

| File | Argomento |
|---|---|
| `SECURITY.md` | Modello di sicurezza, tabella dei permessi per tabella |
| `docs/AI.md` | Bubbles: modello, prompt di sistema, knowledge base, costi |
| `docs/PAYMENTS.md` | Stripe Checkout, webhook, punti, configurazione |
| `docs/ADMIN_SETUP.md` | Creare e reimpostare un amministratore |
| `docs/DEPLOY.md` | Variabili d'ambiente e deploy |
| `GUIDA_PRODOTTO.md` | Il prodotto dal punto di vista della struttura |
