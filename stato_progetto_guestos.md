# 🏨 GuestOS Hotel Posta — Stato del Progetto (22 maggio 2026)

## 🌐 Deployment

| Info | Dettaglio |
|------|-----------|
| **Sito Live** | [guestos-hotel-posta-1.vercel.app](https://guestos-hotel-posta-1.vercel.app) |
| **Repo GitHub** | [umidifire22-cell/guestos-hotel-posta](https://github.com/umidifire22-cell/guestos-hotel-posta) |
| **Branch** | `main` (auto-deploy Vercel ad ogni push) |
| **Tipo Deploy** | Sito statico HTML/CSS/JS + 1 Vercel Function (`/api/chat`) |
| **Backend** | Supabase (DB + Auth + RPC pgcrypto) |
| **AI** | Anthropic Claude Haiku 4.5 |
| **Meteo** | OpenWeather + weatherwidget.io (Tropea, Calabria) |

---

## 📂 Struttura File

```
guestos-hotel-posta/
├── index.html                       ← Homepage (Bubbles)
├── login.html                       ← Login ospiti (Supabase users)
├── account.html                     ← Profilo
├── ristorante.html                  ← Menu + prenotazione tavolo (Supabase)
├── spa.html                         ← SPA & benessere
├── tours.html / tour-detail.html    ← Tour ed escursioni
├── games.html / quiz.html           ← Gamification
├── chat.html                        ← Chat con Bubbles (AI Claude)
├── rewards.html / leaderboard.html  ← Premi + classifica
├── lastminute.html / animazione.html
├── guestos-admin-login.html         ← Admin login (Supabase RPC)
├── guestos-admin-dashboard.html     ← Dashboard admin (Yield Mgmt + stats)
├── app.js                           ← Navigazione + PWA
├── tours-enhanced.js                ← Logica tour
├── config.js                        ← Supabase + OpenWeather config
├── common.css                       ← Stili condivisi
├── manifest.json + service-worker.js ← PWA
├── vercel.json                      ← URL rewrites
├── api/
│   └── chat.js                      ← Vercel Function AI (Claude)
└── assets/icon-512.png              ← Icona PWA (220 KB)
```

---

## ✅ Cosa funziona

| Feature | Stato |
|---------|-------|
| 🏠 Homepage + quick actions | ✅ |
| 🍽️ Ristorante (booking → Supabase) | ✅ |
| 💆 SPA | ✅ |
| 🚢 Tour & escursioni | ✅ |
| 🎮 Gamification (20+ giochi) | ✅ |
| 🧩 Quiz interattivi | ✅ |
| 🎁 Rewards + 🏆 Leaderboard | ✅ |
| ⚡ Last Minute | ✅ |
| 🎭 Animazione | ✅ |
| 💬 **Chat AI Bubbles** (Claude Haiku) | ✅ con fallback keyword |
| 👤 Login ospiti (Supabase) | ✅ |
| 🔧 Login admin (RPC pgcrypto) | ✅ |
| 🔧 Admin dashboard | ✅ |
| 📱 PWA installabile | ✅ |
| 🌐 Auto-deploy Vercel | ✅ |

## 🔧 Lavori fatti il 22/05/2026

- 🗑️ Rimosso `/guestos-admin/` (cartella obsoleta con credenziali hardcoded)
- 🗑️ Rimosso `spa_old.html`, `tours_old.html`, `bottom-nav-component.txt`
- 🗑️ Rimossi `.DS_Store` dal repo + aggiunto `.gitignore`
- 🐛 Fix `chat.html` (doppio `<body>` + Tawk.to legacy rimosso)
- 🐛 Fix `service-worker.js` (precache completo + fallback offline + cleanup vecchia cache)
- 🔒 Demo credentials nascoste dietro `?demo=1`
- 🗜️ `icon-512.png` da 4.9 MB → 220 KB
- 🤖 Nuova chat AI con Vercel Function `/api/chat` (Anthropic Claude Haiku)

## ⚠️ Da configurare su Vercel

Per attivare la chat AI vera (sennò usa il fallback keyword):

```
Vercel → Project Settings → Environment Variables
ANTHROPIC_API_KEY = sk-ant-...
```

---

## ❌ Cosa manca per arrivare a €3.000+

| # | Feature | Priorità | ROI |
|---|---------|----------|-----|
| 1 | 📊 **Dynamic Pricing** | Alta | +15-25% revenue |
| 2 | 👥 **CRM / Customer Data Platform** | Alta | €500-800/mese |
| 3 | 🔔 **Smart Notifications push** | Media | +10-15% ancillary |
| 4 | 👷 **Staff Operations Dashboard** | Media | €400-600/mese |
| 5 | ⭐ **Review Manager TripAdvisor/Google** | Alta | Inestimabile |
| 6 | 📱 **Self check-in contactless** | Media | €300-500/mese |
| 7 | 📈 **Analytics enterprise** | Bassa | Decision support |
| 8 | 📧 **Email/SMS conferma prenotazioni** | Alta | Trust |

---

## 💰 Posizionamento commerciale

- **Stato attuale**: app premium **€2.000–3.000** chiavi in mano
- **Con AI + Revenue Tools (mancanti)**: **€4.000–5.000+** una tantum
- **SaaS recurring**: €200/mese (hosting + AI + supporto)
- **Setup per nuovo hotel**: 2-3 ore (logo, palette, menu, escursioni, tabella `users` Supabase)

## 🔧 Info tecniche

- **Supabase URL**: `gqqgotvbabgxztrxbozu.supabase.co`
- **Hotel Location**: Calabria (lat 39.2, lon 16.25) — widget meteo punta a Tropea
- **Vercel URL rewrites**: `/tours`, `/chat`, `/ristorante`, `/spa`, `/tour-detail`, `/animazione`, `/lastminute`
- **Tabella admin**: `admin_users` (id, email, password_hash, hotel_id, full_name, role, active)
- **Tabella ospiti**: `users` (room_number, last_name, password, active)
- **Tabella prenotazioni**: `restaurant_bookings` (user_email, booking_date, booking_time, num_people, status, ...)
- **Tabella punti**: `user_points` (user_email, points)
- **Admin login**: Supabase RPC `admin_login(p_email, p_password)` con `crypt()` (pgcrypto)
- **Admin credentials demo**: `admin@hotelposta.it` / `demo2024`
