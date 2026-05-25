# GuestOS — Hotel Posta

> **L'app PWA all-in-one che trasforma l'esperienza dei tuoi ospiti in revenue.**

## Demo

| Link | Stato |
| --- | --- |
| [Demo live](https://guestos-hotel-posta-gamma.vercel.app) | Online |
| [Accesso ospite demo](https://guestos-hotel-posta-gamma.vercel.app/login.html?demo=1) | Online |
| [Admin demo](https://guestos-hotel-posta-gamma.vercel.app/guestos-admin-login.html) | Online |
| [Codice sorgente](https://github.com/rownap/guestos-hotel-posta) | Pubblico |

---

## Stato portfolio

GuestOS è una PWA verticale per hotel già deployata, pensata come prodotto white-label per aumentare revenue ancillary e qualità dell'esperienza ospite. La demo pubblica mostra il flusso ospite, il catalogo servizi, la gamification e la dashboard admin.

| Area | Stato |
|------|-------|
| PWA ospite | Live |
| Chat AI | Live con fallback se `ANTHROPIC_API_KEY` non è configurata |
| Admin dashboard | Live |
| Booking ristorante / punti | Collegati a Supabase |
| Revenue tools | In espansione |

## Cosa fa per gli ospiti

- **Bubbles AI Receptionist** — chat 24/7 in italiano per orari, info e suggerimenti.
- **Ristorante** — menu, calendario e prenotazione tavolo con sconto in punti.
- **SPA** — catalogo trattamenti e booking immediato.
- **Escursioni** — tour locali con dettagli, foto e prenotazione.
- **Gamification** — giochi, quiz, leaderboard e reward riscattabili.
- **Animazione** — programma sera per sera.
- **Last Minute** — offerte flash per gli ospiti presenti in struttura.
- **PWA** — installabile su iOS/Android dalla schermata Home.

## Cosa fa per la direzione

- **Dashboard admin** con yield management, gestione contenuti e statistiche.
- **Prenotazioni sincronizzate** su Supabase (`restaurant_bookings`, `user_points`).
- **Login admin** via Supabase RPC + pgcrypto.
- **Deploy automatico** su Vercel a ogni `git push`.

## 🛠 Stack

| Componente | Tecnologia |
|------------|-----------|
| Frontend | HTML5 / CSS3 / JS vanilla (zero build) |
| Backend | Supabase (Postgres + Auth + RPC) |
| AI | Anthropic Claude Haiku via Vercel Function |
| Hosting | Vercel (auto-deploy da GitHub) |
| Meteo | OpenWeather + weatherwidget.io |

## 🚀 Setup locale

```bash
git clone https://github.com/rownap/guestos-hotel-posta.git
cd guestos-hotel-posta
npx serve .
# apri http://localhost:3000
```

## 🔑 Variabili ambiente (Vercel)

Per attivare la chat AI vera (Bubbles), aggiungi in **Vercel → Project Settings → Environment Variables**:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | la tua key da [console.anthropic.com](https://console.anthropic.com) |

Senza la key, la chat usa un fallback keyword-based.

## 🔐 Sicurezza

- Le chiavi private restano su Vercel/Supabase, non nel repository.
- La Supabase anon key può essere usata lato browser solo con Row Level Security correttamente configurata.
- Le credenziali demo operative non devono essere documentate nel repository pubblico.
- Vedi [`SECURITY.md`](./SECURITY.md) per le regole di gestione segreti.

## Portfolio note

Questo repository mostra una demo live verificabile. Eventuali pricing, proposta commerciale, contatti diretti e condizioni per hotel non sono documentati nel repository pubblico: vanno gestiti in materiali privati o in una landing commerciale dedicata.
