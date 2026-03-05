# 🏨 GuestOS Hotel Posta — Stato del Progetto (5 Marzo 2026)

> [!CAUTION]
> **CODICE LOCALE ≠ CODICE ONLINE!** La versione deployata su Vercel contiene file che NON esistono nella repo locale (es. `guestos-admin-login.html`, `guestos-admin-dashboard.html`). Mentre il file locale `guestos-admin/index.html` restituisce 404 su Vercel. Vercel potrebbe essere collegato a un branch/deploy diverso, oppure la repo locale non è sincronizzata.

## 🌐 Deployment Attuale

| Info | Dettaglio |
|------|-----------|
| **Sito Live** | [guestos-hotel-posta-1.vercel.app](https://guestos-hotel-posta-1.vercel.app) |
| **Repo GitHub** | [umidifire22-cell/guestos-hotel-posta](https://github.com/umidifire22-cell/guestos-hotel-posta) |
| **Branch** | `main` (unico branch, 1 commit: "Initial commit") |
| **Vercel Source** | Legge dalla **root** del repo → la cartella `/Users/robertociccarelli/Documents/GitHub/guestos-hotel-posta` |
| **Tipo Deploy** | Sito statico (HTML/CSS/JS) |
| **Backend** | Supabase (DB + Auth) |
| **Meteo API** | OpenWeather (Calabria, lat 39.2, lon 16.25) |

> [!IMPORTANT]
> **Come funziona il deploy:** Vercel è collegato alla repo GitHub `umidifire22-cell/guestos-hotel-posta`. Ogni push su `main` fa partire un deploy automatico. Tuttavia, il codice online contiene file extra non presenti in locale — potrebbe esserci un deploy manuale o un branch diverso collegato.

### ⚠️ File SOLO online (non nel repo locale)
| File Online | Stato Locale |
|---|---|
| `guestos-admin-login.html` (root) | ❌ Non esiste |
| `guestos-admin-dashboard.html` (root) | ❌ Non esiste |
| `guestos-admin/index.html` | ✅ Esiste localmente ma dà **404 su Vercel** |

---

## 📂 Struttura File nel Repo

```
guestos-hotel-posta/
├── index.html              ← Homepage (Bubbles Assistant)
├── login.html              ← Login utente
├── account.html            ← Profilo account
├── ristorante.html         ← Menu & prenotazioni ristorante
├── spa.html                ← Servizi SPA & benessere
├── tours.html              ← Tour ed escursioni
├── tour-detail.html        ← Dettagli singolo tour
├── games.html              ← Giochi e gamification (20+ giochi)
├── quiz.html               ← Quiz interattivi
├── chat.html               ← Chat con Bubbles
├── rewards.html            ← Sistema premi
├── leaderboard.html        ← Classifica punti
├── lastminute.html         ← Offerte last minute
├── animazione.html         ← Animazione hotel
├── app.js                  ← Logica principale (navigazione, chat, PWA)
├── tours-enhanced.js       ← Logica avanzata tour
├── config.js               ← Config Supabase + OpenWeather
├── common.css              ← Stili condivisi
├── manifest.json           ← PWA manifest
├── service-worker.js       ← PWA service worker
├── vercel.json             ← URL rewrites (/tours → tours.html, ecc.)
├── assets/                 ← Immagini e risorse
├── guestos-admin/          ← 🔧 Pannello Admin
│   ├── index.html          ← Login admin
│   ├── dashboard.html      ← Dashboard gestione (43KB!)
│   └── config.js           ← Config admin
└── README.md
```

---

## ✅ Cosa FUNZIONA Già

| Feature | Stato | Note |
|---------|-------|------|
| 🏠 Homepage | ✅ Funziona | Quick actions, weather widget |
| 🍽️ Ristorante | ✅ Funziona | Menu, prenotazione tavoli |
| 💆 SPA | ✅ Funziona | Catalogo trattamenti, booking |
| 🏛️ Tour & Escursioni | ✅ Funziona | Lista tour, dettagli, booking |
| 🎮 Gamification | ✅ Funziona | 20+ giochi, punti, leaderboard |
| 🧩 Quiz | ✅ Funziona | Quiz interattivi |
| 🎁 Rewards | ✅ Funziona | Sistema premi riscattabili |
| 🏆 Leaderboard | ✅ Funziona | Classifica giocatori |
| ⚡ Last Minute | ✅ Funziona | Offerte flash |
| 🎭 Animazione | ✅ Funziona | Programma animazione |
| 💬 Chat | ✅ Parziale | Risposte bot basiche (no AI) |
| 👤 Login Ospiti | ✅ Funziona | Auth via Supabase (tabella `users`) |
| 📱 PWA | ✅ Funziona | Installabile, service worker |
| 🔧 Admin Login | ✅ Funziona | Supabase RPC `admin_login` con pgcrypto (`crypt()`) |
| 🔧 Admin Dashboard | ✅ Funziona | Yield Management, gestione contenuti, statistiche |
| 🌐 Deploy Vercel | ⚠️ Online ma desincronizzato | Codice online ≠ codice locale |

---

## ❌ Cosa MANCA (da analisi strategica precedente)

| # | Feature | Valore ROI | Stato |
|---|---------|------------|-------|
| 1 | 🤖 **AI Receptionist H24** | €800-1200/mese | ❌ Non implementato |
| 2 | 📊 **Dynamic Pricing** | +15-25% revenue | ❌ Non implementato |
| 3 | 👥 **CRM / Customer Data Platform** | €500-800/mese | ❌ Non implementato |
| 4 | 🔔 **Smart Notifications** | +10-15% ancillary | 🟡 Solo badge base |
| 5 | 👷 **Staff Operations Dashboard** | €400-600/mese | ❌ Non implementato |
| 6 | ⭐ **Review Manager** | Inestimabile | ❌ Non implementato |
| 7 | 📱 **Contactless Suite** | €300-500/mese | 🟡 Booking esiste, no check-in |
| 8 | 📈 **Analytics Enterprise** | Decision support | 🟡 Stats base in admin |

---

## 💰 Valutazione

- **Stato attuale**: App da **€800-1200** (bella UI, funzionale ma "commodity")
- **Con implementazioni AI + Revenue Tools**: App da **€3000-5000+**
- **Target prezzo**: €3000 one-time + €200/mese SaaS
- **Payback per hotel**: 2-3 settimane

---

## 🔧 Info Tecniche

- **Supabase URL**: `gqqgotvbabgxztrxbozu.supabase.co`
- **Hotel Location**: Calabria (lat 39.2, lon 16.25)
- **Vercel URL rewrites**: `/tours`, `/chat`, `/ristorante`, `/spa`, `/tour-detail`, `/animazione`, `/lastminute`
- **Git**: 1 solo commit, branch `main`, working tree pulito
- **Admin Login**: funzione PostgreSQL `admin_login` con `crypt()` (pgcrypto)
- **Admin Credentials**: `admin@hotelposta.it` / `demo2024`
- **Tabella admin**: `admin_users` (id, email, password_hash, hotel_id, full_name, role, active)
- **Tabella ospiti**: `users` (room_number, last_name, password, active)

## ⚡ Azione Prioritaria

> [!WARNING]
> **Sincronizzare il codice!** La repo locale non corrisponde a ciò che è online. Prima di fare qualsiasi modifica, serve capire da dove Vercel prende il codice e sincronizzare tutto.
