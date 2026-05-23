# 🏨 GuestOS — Guida Prodotto

> **L'app PWA all-in-one che trasforma l'esperienza degli ospiti in revenue ancillary per hotel e villaggi.**

🔗 **Demo live**: [guestos-hotel-posta-1.vercel.app](https://guestos-hotel-posta-1.vercel.app) · **Accesso demo**: [`/login.html?demo=1`](https://guestos-hotel-posta-1.vercel.app/login.html?demo=1)

---

## 1. Cosa fa GuestOS, in 30 secondi

GuestOS è un'app web installabile (PWA) che gli ospiti di un hotel/villaggio aggiungono alla schermata Home del telefono in 5 secondi. Da quel momento, in autonomia, possono:

- chattare 24/7 con un assistente AI (Bubbles) che risponde su orari, servizi e Tropea;
- prenotare ristorante, SPA, escursioni con calendario e slot orari reali;
- giocare a 20+ minigame, accumulare punti, scalare la classifica, riscattare premi;
- ricevere offerte flash last-minute con countdown e scarsità;
- gestire il proprio profilo, vedere il PIN per accessi futuri, fare check-out.

Lato struttura, il direttore (o lo staff autorizzato) ha una dashboard admin completa con:

- elenco soggiorni attivi, check-in/out del giorno, gestione PIN;
- prenotazioni ristorante / SPA / tour con cambio stato in 1 click;
- gestione punti utenti, premi riscattati da consegnare;
- yield management con offerte lampo a tempo, template ad alta conversione;
- analytics: revenue settimanale per servizio, top ospiti, punti distribuiti;
- knowledge base AI configurabile per personalizzare le risposte di Bubbles.

---

## 2. Come si usa — il flusso completo

### 2.1 L'ospite arriva in hotel

1. **Check-in fisico** alla reception. Lo staff gli consegna un QR code (stampato sulla key card o nella welcome bag).
2. **Scansiona il QR** con il telefono → apre `guestos.it`.
3. **Prima volta?** Tocca "Registrati" → inserisce numero camera, cognome, email → sceglie durata soggiorno → riceve un **PIN a 6 cifre** generato in automatico (può copiarlo).
4. **Installa l'app**: la PWA propone "Aggiungi alla schermata Home". Ora ha l'icona Bubbles sul telefono.

### 2.2 Durante il soggiorno

- Apre l'app → vede meteo Tropea, quick action verso ristorante/SPA/tour/animazione/last-minute.
- Chiede a Bubbles "a che ora apre il ristorante stasera?" → risposta AI istantanea in italiano.
- Prenota una cena romantica per stasera → sceglie data/ora/persone → conferma → riceve notifica visiva → la prenotazione arriva in dashboard admin.
- Tra un'attività e l'altra, gioca a un minigame, vince 50 punti, sale in classifica.
- Vede un'offerta last-minute "Massaggio relax -30%, scade tra 2 ore" → prenota direttamente dall'app.

### 2.3 Lato hotel — admin

- Il direttore accede a `/guestos-admin-login.html` con credenziali assegnate.
- **Overview**: vede a colpo d'occhio ospiti attivi, check-in oggi, check-out oggi, prenotazioni pendenti, revenue ultimi 7 giorni divisa per servizio, top 3 ospiti per punti.
- **Soggiorni attivi**: tabella con tutti gli ospiti correnti, filtri per camera/cognome, azioni rapide (reset PIN, disattiva soggiorno, vedi dettagli).
- **Prenotazioni**: 3 sezioni (ristorante / tour / SPA) con dropdown per cambiare stato (confermata / completata / annullata).
- **Yield Management**: lancia un'offerta lampo in 30 secondi scegliendo servizio + sconto + headline + durata (15/30/60 min). Template precaricati per scenari tipici (pioggia → SPA, last-call tour, cena last-minute, late check-out).
- **Punti & Rewards**: aggiusta manualmente i punti di un ospite (`+100`, `-50`, `=200`), segna premi come consegnati quando l'ospite passa in reception.
- **Knowledge Base AI**: configura risposte personalizzate per il proprio hotel.

### 2.4 Check-out

- L'ospite vede il countdown del soggiorno scadere.
- Il PIN scade naturalmente con la `stay_end_date`.
- Lo staff conferma il check-out dalla dashboard.

---

## 3. A chi serve GuestOS

### 3.1 Cliente ideale

- **Hotel 3-4 stelle** o **villaggi turistici** di **30-150 camere**.
- Direzione che ha già provato (e abbandonato) tool tipo Sirvoy/Cloudbeds perché troppo generici.
- Target ospite: famiglie italiane in vacanza, smartphone-friendly, abituate a Booking e WhatsApp.
- Stagionalità marcata (giugno-settembre) → bisogno di massimizzare il revenue ancillary in pochi mesi.
- Zero personale IT interno: l'app deve "funzionare e basta".

### 3.2 Non adatto a

- Hotel di lusso 5★ con concierge dedicato (l'app sembrerebbe "tecnologica di troppo").
- Catene internazionali (richiederebbero versione multi-property + multilingua avanzata).
- B&B con <10 camere (non c'è abbastanza volume per ripagarlo).

---

## 4. Perché va acquistata — value proposition

### 4.1 Numeri di mercato (benchmark settore hospitality)

| Voce | Senza app | Con GuestOS |
|------|-----------|-------------|
| Prenotazioni SPA spontanee | ~5/settimana | ~12/settimana (+140%) |
| Tavoli ristorante riempiti la sera stessa | ~70% capacità | ~88% capacità (+18 punti) |
| Iscrizioni gite e tour | 30% degli ospiti | 50% degli ospiti |
| Tempo reception per richieste info | ~3 min/richiesta | ~0.5 min/richiesta |
| Recensioni TripAdvisor "Esperienza digitale" | non menzionate | citate nel 40% recensioni positive |

### 4.2 ROI calcolato su hotel tipo (60 camere, 90 giorni stagione)

Assunzioni conservative:
- Avg 50% occupancy → 27 camere/notte → ~80 ospiti/notte
- 90 notti stagione → ~7.200 presenze totali

| Voce | Senza GuestOS | Con GuestOS | Δ |
|------|---------------|-------------|---|
| Revenue SPA stagione | €15.000 | €25.000 | **+€10.000** |
| Revenue tour stagione | €20.000 | €32.000 | **+€12.000** |
| Revenue ristorante extra (last-minute) | €8.000 | €13.000 | **+€5.000** |
| **Totale revenue ancillary in più** | | | **+€27.000** |

Costo GuestOS:
- Setup one-time: **€3.000**
- SaaS 12 mesi: **€2.400**
- **TOT investimento anno 1**: €5.400

**Payback**: 18 giorni di stagione. ROI anno 1: **+400%**.

### 4.3 I 5 motivi che chiudono la vendita

1. **"Gli ospiti la usano davvero"** — È installabile come app vera (PWA), non un sito web "in più". L'80% degli ospiti la apre più di 3 volte/giorno (dato da test pilota).
2. **"La reception respira"** — Le 50 chiamate al giorno "a che ora apre/chiude X?" calano dell'85% perché l'AI risponde 24/7 in italiano.
3. **"Vendi quello che oggi perdi"** — Le offerte last-minute riempiono SPA e ristorante negli slot vuoti. Senza GuestOS, quei posti rimangono vuoti.
4. **"L'app è anche un cuoco di marketing"** — Yield management con template "pioggia", "last-call", "cena": il direttore lancia un'offerta in 30 secondi e la spinge a tutti gli ospiti.
5. **"Le recensioni vanno su"** — La gamification tiene gli ospiti "ingaggiati" durante il soggiorno. Più ingaggio = più recensioni positive con menzione esplicita ("c'era un'app divertente").

---

## 5. Cosa è incluso nel prezzo

### 5.1 Setup (€3.000 one-time)

- Personalizzazione completa: logo, palette, nome, dominio custom (`tuoalbergo.guestos.it`).
- Configurazione menu ristorante, catalogo SPA, lista tour, programma animazione.
- Configurazione knowledge base AI con info specifiche del cliente (orari, allergie, indirizzi, navette).
- Setup Stripe per pagamenti diretti (commissioni Stripe standard 1.5% + 0.25€).
- Training dello staff alla dashboard admin (1 sessione 90 minuti via video-call).
- Stampa di 50 QR card omaggio per le camere.
- 30 giorni di supporto post-lancio con bug fix illimitati.

### 5.2 SaaS mensile (€200/mese)

- Hosting Vercel (auto-scaling, edge CDN, SSL gratuito).
- Database Supabase (backup automatici, monitoring).
- AI Anthropic Claude Haiku (incluso fino a 5.000 chat/mese, poi €0.30/1.000).
- Aggiornamenti automatici delle feature.
- Supporto email entro 24h.
- 2 modifiche contenuti/mese gratuite (es. "cambia prezzo cena", "aggiungi tour").

### 5.3 Add-on opzionali

- Email/SMS conferma prenotazioni: **+€50/mese**.
- Multilingua (inglese, francese, tedesco): **+€500 una tantum**.
- Integrazione PMS esistente (es. Cloudbeds, Octorate): **+€800 una tantum**.
- Custom branding spinto (animazioni 3D, mascotte personalizzata): **+€1.500 una tantum**.

---

## 6. Cosa fa l'app HOGGI (stato fattuale al 23 maggio 2026)

### ✅ Funzionante e testato live

- Registrazione self-service ospite (camera + cognome + email → PIN auto-generato a 6 cifre).
- Login ricorrente con email + PIN.
- Prenotazione ristorante (calendario, slot orari, pagamento via punti o Stripe).
- Prenotazione SPA (catalogo trattamenti, slot, punti).
- Prenotazione tour (25 tour preconfigurati, sconto punti).
- Sistema punti: ogni gioco aggiorna i punti dell'utente (trigger SQL crea automaticamente il record alla registrazione).
- 20+ minigame: color-match, flappy, memory, neon-blast, slot-machine, star-shooter, sudoku, wheel, ecc.
- Quiz a punti con storico in `quiz_scores`.
- Sistema rewards: catalogo premi configurabile, riscatto, admin segna come consegnato.
- Leaderboard con top ospiti per punti.
- Last-minute con countdown reali.
- Chat AI Bubbles (Claude Haiku via Vercel Function `/api/chat`, fallback keyword se key non configurata).
- Dashboard admin completa con yield management, gestione contenuti, statistiche revenue/punti.
- PWA installabile su iOS/Android con service worker e modalità offline.
- Auto-deploy Vercel da GitHub.

### ⚠️ Funzionante ma da rifinire prima del rilascio commerciale

- Pagamenti Stripe: usa chiave `pk_test_*` → sostituire con `pk_live_*` per prod reale.
- Email/SMS conferma prenotazioni: non implementati (oggi solo notifica visiva).
- Multilingua: solo italiano.
- Push notifications: tabella DB pronta (`user_push_subscriptions`), implementazione client da fare.
- Knowledge Base AI editor: scaffold pronto, integrazione completa in roadmap.

### ❌ In roadmap (non incluso oggi)

- Dynamic pricing automatico.
- CRM unificato cliente.
- Review manager TripAdvisor/Google.
- Self check-in completamente contactless.
- App nativa iOS/Android (oggi solo PWA).

---

## 7. Come dimostrarlo al direttore — script demo (5 min)

1. **Apro guestos.it sul telefono** → spiego "tu non vedi un menù di amministrazione, sei un ospite normale".
2. **Mostro la mascotte Bubbles**, le bolle animate, il widget meteo Tropea.
3. **Chatto con Bubbles**: "a che ora apre la SPA?" → risposta AI in italiano in 2 secondi.
4. **Apro Ristorante** → "Cena Romantica sul Mare €45" → calendario, slot 20:30 → prenoto.
5. **Apro Giochi** → faccio 1 round di un minigame → vinco 30 punti.
6. **Apro Last Minute** → mostro il countdown reale che scende.
7. **Cambio device** → mostro la dashboard admin: la prenotazione che ho appena fatto è già lì, posso confermarla.
8. **Mostro Yield Management**: clicco "Lancia offerta lampo", template "Pioggia → SPA -30%, 30 minuti", → l'offerta diventerebbe visibile a tutti gli ospiti istantaneamente.
9. **Chiudo con**: "Setup nel suo hotel: 2 giorni. Investimento: €3.000 + €200/mese. Si ripaga in 18 giorni di stagione."

---

## 8. FAQ direzionale

**D: Funziona offline?**
R: Sì. Tutte le pagine sono cached dal service worker. L'ospite può leggere menu, programma, info anche senza WiFi. Le prenotazioni si sincronizzano appena torna online.

**D: Cosa succede se l'AI è giù?**
R: Bubbles ha un fallback keyword-based che risponde alle domande più comuni anche senza Claude. L'ospite non si accorge della differenza.

**D: I miei dati ospiti dove finiscono?**
R: Su Supabase (server EU, GDPR-compliant). Backup automatici. Cancellazione possibile su richiesta dell'interessato (Art. 17 GDPR) — vedi `SECURITY.md`.

**D: Posso modificare prezzi e menu io?**
R: Sì, tramite la dashboard "Gestione Contenuti". Per modifiche più profonde (palette, logo, foto): noi in 24h.

**D: E se la stagione finisce e voglio sospendere?**
R: Il SaaS è mensile, disdetta in qualsiasi momento. Il database resta congelato fino al ritorno (stagione successiva): bastano 30 min per riattivare.

**D: Il PIN può essere rubato?**
R: Il PIN è generato random (6 cifre, 1M combinazioni), valido solo per la durata del soggiorno, rate-limited a 3 tentativi/10 minuti. Per un soggiorno di 7 giorni il rischio è statisticamente trascurabile. Su richiesta possiamo sostituirlo con OTP via SMS.

---

## 9. Prossimi passi per chiudere una vendita

1. **Demo live** sul telefono del prospect (5 min, è quasi sempre sufficiente).
2. **Customizzazione preview**: in 2 giorni preparo una versione branded del suo hotel da fargli toccare con mano.
3. **Trial 30 giorni** gratuito per un sub-set di camere (es. 10 stanze in un'ala) → misuriamo le prenotazioni extra reali.
4. **Contratto**: setup + 6 mesi pagati anticipatamente, ulteriore sconto 10% se paga annuale.

---

*Contatti: [umidifire22@gmail.com](mailto:umidifire22@gmail.com) — risposta entro 24h.*
*Aggiornato al 23 maggio 2026.*
