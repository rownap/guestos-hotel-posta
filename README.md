# 🏨 GuestOS — Hotel Posta

> **L'app PWA all-in-one che trasforma l'esperienza dei tuoi ospiti in revenue.**

🔗 **Demo live:** [guestos-hotel-posta-1.vercel.app](https://guestos-hotel-posta-1.vercel.app)
📲 **Accesso demo:** [/login.html?demo=1](https://guestos-hotel-posta-1.vercel.app/login.html?demo=1)
🛠️ **Admin:** [/guestos-admin-login.html](https://guestos-hotel-posta-1.vercel.app/guestos-admin-login.html)

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

## ✨ Cosa fa per i tuoi ospiti

- 💬 **Bubbles AI Receptionist** — chat 24/7 in italiano (Claude Haiku) per orari, info, suggerimenti.
- 🍽️ **Ristorante** — menu, calendario, prenotazione tavolo con sconto in punti.
- 💆 **SPA** — catalogo trattamenti e booking immediato.
- 🚢 **Escursioni** — tour locali con dettagli, foto, prenotazione.
- 🎮 **Gamification** — 20+ giochi, quiz, leaderboard, rewards riscattabili come sconti.
- 🎭 **Animazione** — programma sera per sera.
- ⚡ **Last Minute** — offerte flash spinte ai presenti in struttura.
- 📱 **PWA** — installabile su iOS/Android dalla schermata Home, funziona offline.

## 💼 Cosa fa per la direzione

- 🔧 **Dashboard admin** con Yield Management, gestione contenuti, statistiche.
- 📨 Prenotazioni reali sincronizzate su Supabase (`restaurant_bookings`, `user_points`).
- 🔐 Login admin sicuro (Supabase RPC + pgcrypto).
- 🌐 Deploy automatico Vercel ad ogni `git push`.

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

## 💰 Per gli hotel

- **Setup**: 2-3 ore di customizzazione (logo, colori, menu, escursioni).
- **Prezzo**: €3.000 una tantum + €200/mese gestione (AI + hosting + supporto).
- **Payback**: 2-3 settimane (anche solo upsell su SPA e tour ripagano l'investimento).
- **Contatti**: [umidifire22@gmail.com](mailto:umidifire22@gmail.com)

---
*Made with 💧 in Calabria — un'app, mille opportunità.*
