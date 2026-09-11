# Messa in opera di una nuova struttura

Procedura completa per pubblicare GuestOS per un nuovo hotel o villaggio. È scritta per essere
seguita passo passo da chi non ha mai visto il progetto: ogni comando è riportato per intero e ogni
passo dice cosa si deve vedere quando è andato a buon fine.

Tempo indicativo: mezza giornata per la parte tecnica, più il tempo necessario a raccogliere i
contenuti della struttura.

Ogni struttura ha un progetto Supabase e un progetto Vercel propri. Non si condivide nulla tra
clienti.

## 0. Prima di cominciare

Servono:

- account Vercel con accesso al repository;
- account Supabase;
- Node 18 o superiore e `git` sul computer;
- CLI Vercel: `npm i -g vercel`;
- CLI Supabase: `npm i -g supabase`;
- account Stripe intestato alla struttura, se si vendono servizi con pagamento in app;
- account Resend e accesso al DNS del dominio, se si vogliono le email di conferma;
- chiave Anthropic, se si vuole l'assistente.

Da raccogliere dalla struttura:

- nome, indirizzo, telefono della reception, orari dei servizi, orario di check-out;
- logo e due o tre foto, menu, listino del centro benessere, elenco delle escursioni con prezzi,
  programma di animazione;
- catalogo dei premi con soglie in punti;
- elenco delle persone dello staff che devono accedere alla console, con le loro email;
- dominio o sottodominio da usare.

```bash
git clone <url-del-repository> guestos-<nome-struttura>
cd guestos-<nome-struttura>
npm install
```

## 1. Creare il progetto sul database

1. Su [supabase.com](https://supabase.com), New project.
2. Nome: `guestos-<nome-struttura>`.
3. Regione: scegliere una regione dell'Unione Europea, per esempio Francoforte. È una scelta che
   riguarda la conformità sui dati personali, non solo la velocità.
4. Salvare la password del database in un gestore di password. Non viene mostrata una seconda volta.
5. Attendere la creazione, due o tre minuti.

Annotare da Project Settings, API:

- l'URL del progetto, nella forma `https://<ref>.supabase.co`;
- la chiave `anon` (pubblica);
- la chiave `service_role` (segreta, non deve mai finire nel browser né nel repository).

## 2. Eseguire le migrazioni, nell'ordine giusto

Le migrazioni si incollano nell'editor SQL di Supabase Studio: Database, SQL Editor, New query,
incolla, Run. Sono idempotenti: rieseguirle non rompe nulla.

L'ordine conta. Va rispettato esattamente questo.

### Passo 0, schema di base

Lo schema di base non è versionato nel repository: le tabelle di dati e di catalogo sono state create
direttamente in Supabase Studio sul primo progetto. Per una struttura nuova va quindi esportato dal
progetto esistente e applicato prima di tutto il resto.

```bash
supabase login
supabase link --project-ref <ref-del-progetto-esistente>
supabase db dump --schema public -f schema_base.sql
```

Aprire `schema_base.sql`, togliere le righe `CREATE POLICY`, `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY` e `GRANT` (le rifà il passo 1 in modo coerente), poi eseguirlo sul progetto nuovo.

Verifica: in Database, Tables devono comparire almeno `users`, `user_points`, `restaurant_bookings`,
`spa_bookings`, `tour_bookings`, `rewards`, `tours`, `spa_services`, `restaurant_menu`,
`last_minute_offers`, `flash_deals`, `admin_users` e le tabelle `ai_*`.

Se qualcosa non torna, fermarsi qui: i passi successivi danno per esistenti queste tabelle.

### Passo 1, blocco di sicurezza

File: `supabase/migrations/20260910120000_security_lockdown.sql`.

Attiva Row Level Security su tutte le tabelle, crea `guest_sessions`, `admin_sessions`,
`guest_credentials`, `login_attempts`, la funzione `is_admin()` e le funzioni di accesso, e sposta i
PIN su hash bcrypt.

Verifica: in Database, Tables, la colonna RLS deve risultare attiva su tutte le righe.

### Passo 2, convergenza del contratto di sessione

File: `supabase/migrations/20260910180000_converge_token_contract.sql`.

Introduce il token in formato UUID accettato sia come parametro sia come header, aggiunge le funzioni
ospite e staff mancanti e la tabella `hotel_settings`.

Verifica, nell'editor SQL:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('guest_register','guest_login','guest_me','award_points','redeem_reward')
order by 1;
```

Devono comparire tutte e cinque.

### Passo 3, assistente

File: `supabase/migrations/004_ai.sql`.

Va eseguita per ultima, nonostante il prefisso numerico più basso: usa `is_admin()`, creata al
passo 1.

Attenzione, punto aperto noto: questa migrazione risolve il token ospite leggendo
`users.session_token`, colonna del modello di sessione precedente al passo 1. Dopo l'esecuzione va
provata la cronologia della chat, e se non scrive nulla la funzione `ai_resolve_guest` va riallineata
a `guest_sessions`. La chat funziona comunque: quello che non funziona è il salvataggio dello storico.

### Passo 4, trigger dei punti

File: `db-setup.sql` nella radice del repository. Crea il trigger che genera la riga `user_points`
alla registrazione di un ospite ed esegue il recupero per gli utenti già presenti.

## 3. Creare il primo amministratore

L'accesso alla console richiede una riga in `admin_users` con la password come hash, più, dove è già
stato completato il passaggio, un utente Supabase Auth con la stessa email.

Nell'editor SQL:

```sql
-- 1) utente staff
insert into public.admin_users (email, password_hash, full_name, role, active)
values (
  'direzione@struttura.it',
  crypt('<password-scelta-ora>', gen_salt('bf')),
  'Nome Cognome',
  'admin',
  true
)
on conflict (email) do update
  set password_hash = excluded.password_hash,
      active = true;
```

Poi, da Supabase Studio, Authentication, Users, Add user: creare l'utente con la **stessa email** e la
stessa password, con conferma email attiva. Serve perché `is_admin()` riconosce lo staff anche dalla
sessione Supabase Auth.

La password va scelta lunga e casuale, comunicata alla direzione fuori banda e cambiata da loro al
primo accesso. Non va scritta in nessun file del repository.

Verifica:

```sql
select email, role, active from public.admin_users;
```

## 4. Impostazioni della struttura

Popolare `hotel_settings`, che alimenta sia le pagine sia il prompt dell'assistente.

```sql
insert into public.hotel_settings (id, name, city, restaurant_hours, spa_hours,
                                   reception_phone, checkout_time, wifi_note, welcome_message)
values (1, 'Nome Struttura', 'Città, Regione', '12:30-14:30 e 19:30-22:00', '10:00-20:00',
        'digita 9 dal telefono della camera', '10:30',
        'WiFi gratuito in tutta la struttura', 'Benvenuto!')
on conflict (id) do update set
  name = excluded.name,
  city = excluded.city,
  restaurant_hours = excluded.restaurant_hours,
  spa_hours = excluded.spa_hours,
  reception_phone = excluded.reception_phone,
  checkout_time = excluded.checkout_time,
  wifi_note = excluded.wifi_note,
  welcome_message = excluded.welcome_message;
```

## 5. Collegare il progetto di pubblicazione

```bash
vercel login
vercel link
# scegliere il team e creare un progetto nuovo: guestos-<nome-struttura>
```

Nelle impostazioni del progetto su Vercel:

- Framework Preset: Other;
- Build Command: vuoto, non c'è alcun passo di compilazione;
- Output Directory: vuoto, la radice del repository;
- Install Command: `npm install`, serve solo alle funzioni serverless.

## 6. Variabili d'ambiente

Da inserire in Vercel, Project Settings, Environment Variables, selezionando Production e Preview.
L'elenco completo con la spiegazione di ciascuna è in [`.env.example`](../.env.example) e nel
[`README.md`](../README.md).

| Variabile | Valore |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | chiave `anon` del progetto |
| `SUPABASE_SERVICE_ROLE_KEY` | chiave `service_role`, segreta |
| `PUBLIC_BASE_URL` | dominio definitivo senza slash finale |
| `ANTHROPIC_API_KEY` | solo se si attiva l'assistente |
| `STRIPE_SECRET_KEY` | solo se si attivano i pagamenti |
| `STRIPE_WEBHOOK_SECRET` | si ottiene al passo 8 |
| `RESEND_API_KEY` | solo se si attivano le email |
| `MAIL_FROM` | per esempio `Nome Struttura <no-reply@dominio.it>` |
| `MAIL_BCC_STAFF` | opzionale, indirizzi separati da virgola |

Da riga di comando, in alternativa:

```bash
echo "https://<ref>.supabase.co" | vercel env add SUPABASE_URL production
```

Ogni volta che si aggiunge o si cambia una variabile serve una nuova pubblicazione perché abbia
effetto.

## 7. Configurare il client

Modificare `config.js` con i dati della struttura:

- `supabaseUrl`: l'URL del progetto nuovo;
- `supabaseKey`: la chiave `anon` del progetto nuovo (è pubblica per definizione, sta nel sorgente di
  ogni pagina);
- `STRIPE_CONFIG.publishableKey`: la `pk_live_...` della struttura, oppure lasciare la chiave di prova
  finché non si va in esercizio;
- `HOTEL_LOCATION`: latitudine, longitudine e nome della località per il riquadro meteo.

Controllare anche `manifest.json`, dove stanno nome e colori dell'icona sulla schermata Home.

Prima pubblicazione:

```bash
vercel --prod
```

## 8. Circuito di pagamento e richiamo automatico

Saltare questo passo se la struttura non vende con pagamento in app. Il dettaglio completo è in
[`PAYMENTS.md`](PAYMENTS.md).

1. Su Stripe, con l'account intestato alla struttura, Sviluppatori, Chiavi API: copiare la chiave
   segreta e metterla in `STRIPE_SECRET_KEY` su Vercel. Usare le chiavi di prova (`sk_test_`) finché
   non si è verificato tutto il percorso.
2. Sviluppatori, Webhook, Aggiungi endpoint:
   - URL: `https://<dominio>/api/stripe-webhook`
   - eventi: `checkout.session.completed` e `checkout.session.async_payment_succeeded`.
3. Copiare il segreto di firma dell'endpoint (`whsec_...`) in `STRIPE_WEBHOOK_SECRET` su Vercel.
4. Pubblicare di nuovo.
5. Provare un pagamento con la carta di prova `4242 4242 4242 4242`, data futura, CVC qualsiasi.
6. Verificare che su Stripe l'evento risulti consegnato con esito 200, e che sul database sia comparsa
   una riga in `payments` e la prenotazione risulti confermata.

Il richiamo automatico è l'unico punto che marca un pagamento come riuscito. Se il segreto di firma è
sbagliato, l'ospite paga ma la prenotazione resta non confermata. È l'errore più costoso della
procedura: va verificato prima della consegna, non dopo.

## 9. Email di conferma

Saltare se non servono.

1. Su [resend.com](https://resend.com) creare l'account, aggiungere il dominio della struttura e
   inserire nel DNS i record indicati (SPF, DKIM e, se richiesto, il record di ritorno).
2. Attendere la verifica del dominio.
3. Creare una chiave API e metterla in `RESEND_API_KEY`.
4. Impostare `MAIL_FROM` con un mittente su quel dominio, per esempio
   `Nome Struttura <no-reply@dominio.it>`.
5. Facoltativo: `MAIL_BCC_STAFF` con l'indirizzo della reception.
6. Pubblicare di nuovo e fare una prenotazione di prova con la propria email.

Se il dominio non è verificato, Resend rifiuta l'invio e nel registro della funzione compare un errore
di mittente. La prenotazione resta comunque valida.

## 10. Dominio personalizzato

1. Vercel, Project Settings, Domains, Add: inserire il dominio o sottodominio, per esempio
   `app.nomestruttura.it`.
2. Inserire nel DNS il record indicato da Vercel, di norma un CNAME verso `cname.vercel-dns.com`.
3. Attendere l'emissione del certificato, in genere pochi minuti.
4. Aggiornare `PUBLIC_BASE_URL` con il dominio definitivo e pubblicare di nuovo.
5. Aggiornare l'URL dell'endpoint webhook su Stripe con il dominio definitivo.

Verifica importante: il dominio deve puntare a **questo** progetto Vercel. Un dominio collegato a un
progetto diverso serve le pagine ma restituisce errore sulle funzioni, quindi assistente, pagamenti ed
email smettono di funzionare senza che le pagine sembrino rotte. Controllo rapido:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<dominio>/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"ciao"}]}'
# atteso: 200
# 404 significa che il dominio punta a un'altra pubblicazione
```

## 11. Personalizzazione dei contenuti

Dalla console di gestione, sezione contenuti:

- menu del ristorante con prezzi;
- listino del centro benessere con durata dei trattamenti;
- escursioni con descrizione, foto e prezzo;
- programma di animazione;
- catalogo dei premi con la soglia in punti;
- voci della base di conoscenza dell'assistente, vedi [`AI.md`](AI.md).

Nel codice, per la parte grafica:

- `assets/icon-192.png` e `assets/icon-512.png`: icone sulla schermata Home;
- `common.css`: colori e carattere;
- `manifest.json`: nome dell'app e colore della barra.

Regola pratica sui contenuti: meglio dieci voci giuste che cento voci copiate dal sito. L'ospite si
accorge subito di un orario sbagliato, e a quel punto smette di fidarsi anche del resto.

## 12. Verifica finale di sicurezza

Da eseguire sempre, anche quando si è certi che le migrazioni siano andate bene. Sostituire `<ref>` e
`<ANON_KEY>` con i valori del progetto nuovo.

### 12.1 La chiave pubblica non deve più leggere la tabella degli ospiti

```bash
ANON="<ANON_KEY>"
REF="<ref>"

curl -s "https://$REF.supabase.co/rest/v1/users?select=id,email,last_name&limit=5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

Esito atteso: `[]`, un elenco vuoto. La Row Level Security filtra tutte le righe perché la richiesta
non porta nessun token di ospite.

Esito che blocca la consegna: se compare anche un solo record con email o cognome, la RLS su `users`
non è attiva. Fermarsi, rieseguire il passo 2.1 e ripetere il controllo.

### 12.2 Le tabelle riservate devono rifiutare la richiesta

```bash
for t in guest_credentials guest_sessions admin_users admin_sessions login_attempts; do
  printf '%-20s ' "$t"
  curl -s "https://$REF.supabase.co/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
  echo
done
```

Esito atteso: per ognuna, un errore di permesso con codice `42501`. Un `[]` va comunque bene, un
elenco con dati no.

### 12.3 Le altre tabelle con dati personali

```bash
for t in user_points payments restaurant_bookings spa_bookings tour_bookings user_rewards game_scores; do
  printf '%-22s ' "$t"
  curl -s "https://$REF.supabase.co/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
  echo
done
```

Esito atteso: `[]` per tutte.

### 12.4 I cataloghi devono invece essere leggibili

```bash
curl -s "https://$REF.supabase.co/rest/v1/rewards?select=id,name&limit=3" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

Esito atteso: un elenco con dei premi. Se anche questo torna vuoto, le policy sono troppo strette e
l'app mostrerà pagine vuote agli ospiti.

### 12.5 Nessuna tabella senza RLS

Nell'editor SQL:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename not in (
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
  )
order by 1;
```

Esito atteso: nessuna riga.

### 12.6 Nessun segreto nel repository

```bash
grep -rnE "sk_(live|test)_|whsec_|service_role|sk-ant-" \
  --include='*.js' --include='*.html' --include='*.json' --include='*.md' . \
  | grep -v node_modules
```

Esito atteso: solo riferimenti nei commenti e nella documentazione, mai un valore vero. Le uniche
chiavi ammesse nel sorgente sono la `anon` di Supabase e la `pk_` di Stripe.

### 12.7 Header di sicurezza

```bash
curl -sI https://<dominio>/guestos-admin-login.html | grep -iE 'x-frame-options|x-robots-tag|cache-control'
```

Esito atteso: `DENY`, `noindex, nofollow`, `no-store`.

## 13. Prova funzionale prima della consegna

Da telefono vero, non solo da simulatore del browser.

1. Registrare un ospite di prova su una camera libera, annotare il PIN.
2. Uscire e rientrare con camera, cognome e PIN.
3. Sbagliare il PIN cinque volte: al sesto tentativo deve comparire il blocco.
4. Aggiungere l'app alla schermata Home e riaprirla da lì.
5. Prenotare un tavolo, un trattamento e un'escursione. Verificare che compaiano nella console.
6. Annullare una prenotazione dall'area profilo.
7. Fare una partita, verificare che i punti aumentino e che la classifica non mostri email di altri.
8. Riscattare un premio e verificare che compaia tra quelli da consegnare.
9. Se attivo, pagare con carta di prova e verificare la conferma automatica e l'email.
10. Se attivo, fare tre domande all'assistente e controllare che le risposte corrispondano agli orari
    veri.
11. Dalla console: rigenerare il PIN dell'ospite di prova, correggere i punti, pubblicare un'offerta a
    tempo e verificarla sul telefono.
12. Mettere il telefono in modalità aereo: le pagine già aperte devono restare leggibili, una
    prenotazione deve fallire con un messaggio chiaro in italiano.

## 14. Da fare prima di consegnare a un cliente vero

Elenco di controllo finale. Va spuntato tutto.

- [ ] Passo 0 eseguito con uno schema esportato, non ricostruito a mano.
- [ ] Migrazioni eseguite nell'ordine 1, 2, 3, 4 e verificate.
- [ ] Verifica di sicurezza del capitolo 12 superata in tutti i suoi punti.
- [ ] Tutti i dati di prova cancellati: ospiti, prenotazioni, pagamenti, punteggi, conversazioni.
- [ ] Chiavi Stripe reali al posto di quelle di prova, sia in `config.js` sia nelle variabili
      d'ambiente, con endpoint webhook sul dominio definitivo.
- [ ] Backup a ripristino puntuale attivi su Supabase.
- [ ] Cancellazione automatica dei dati degli ospiti dopo la scadenza del periodo di conservazione.
- [ ] Informativa privacy aggiornata con i dati della struttura, come titolare del trattamento, e
      collegata prima della registrazione.
- [ ] Registro dei trattamenti compilato e fornitori nominati responsabili del trattamento.
- [ ] Utenti dello staff creati, uno per persona, senza credenziali condivise.
- [ ] Password iniziali comunicate fuori banda e cambiate al primo accesso.
- [ ] Dominio personalizzato attivo, con certificato valido e funzioni raggiungibili, controllo del
      capitolo 10.
- [ ] Contenuti reali caricati e riletti dalla direzione, non testi di esempio.
- [ ] Base di conoscenza dell'assistente approvata dalla direzione, vedi [`AI.md`](AI.md).
- [ ] Prova funzionale del capitolo 13 completata da telefono.
- [ ] Formazione dello staff effettuata e una persona di riferimento individuata in struttura.
- [ ] Recapito e orari del supporto concordati per iscritto.
- [ ] Prova di esportazione dei dati mostrata alla direzione.
- [ ] Tre pagine di prenotazione migrate al modello nuovo, vedi
      [`stato_progetto_guestos.md`](../stato_progetto_guestos.md).

## 15. Manutenzione ricorrente

- Ogni mese: controllare i registri delle funzioni su Vercel, il consumo Anthropic, gli eventi Stripe
  non consegnati.
- Ogni stagione: cancellare i dati degli ospiti oltre il periodo di conservazione, aggiornare listini
  e contenuti, verificare la scadenza del dominio e rifare la verifica del capitolo 12.
- A ogni intervento sul database: rieseguire la verifica del capitolo 12. Una policy sbagliata non
  produce alcun errore visibile nell'app, si nota solo con quel controllo.
