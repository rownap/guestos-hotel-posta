# GuestOS — istruzioni per Claude

**Prima di lavorare, leggi `STATO.md`.** Contiene dove siamo, cosa è già fatto e
cosa manca.

## Regole che non si violano

1. **Non scrivere sul database di produzione** fuori dalle normali RPC
   dell'applicazione. Le letture con la anon key vanno bene per ispezionare.
2. **Non toccare `supabase/migrations/`**: è di un'altra sessione. Se serve una
   modifica al database, chiedila invece di farla.
3. **Non committare, non pushare, non cambiare branch** se Roberto non lo chiede.
4. **Le chiavi segrete non arrivano mai al browser**: `SUPABASE_SERVICE_ROLE_KEY`,
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
   `RESEND_API_KEY` stanno solo nelle variabili d'ambiente Vercel. La anon key di
   Supabase e la `pk_` di Stripe sono pubbliche per progetto: nel sorgente ci
   stanno bene.

## Com'è fatto

PWA in HTML/CSS/JS puro, **nessun build step**. Database Supabase con RLS attiva:
il browser legge i cataloghi e scrive **solo** attraverso RPC `SECURITY DEFINER`.
Quattro Vercel Function in `api/` (CommonJS, `module.exports = async (req,res)`).

Ordine degli script, obbligatorio:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
<script src="guest-session.js"></script>
```

## Come si scrive qui

- Italiano nei commenti, nei messaggi all'ospite e nei commit.
- Un commento spiega **perché**, non cosa: il cosa si legge dal codice.
- Tutto ciò che finisce in `innerHTML` passa da `escapeHtml()`. I nomi scelti
  dagli ospiti sono testo di terzi.
- Niente `onclick` con stringhe interpolate: `data-*` più `addEventListener`.
- Meglio un messaggio onesto ("si conferma in reception") di una funzione che
  finge di andare e fallisce in silenzio.

## Prima di dire che funziona

```bash
for f in *.js api/*.js lib/*.js; do node --check "$f" || echo "ROTTO: $f"; done
```

E per gli script inline nelle pagine, estraili e passali a `node --check`.
Verifica sempre le firme delle RPC contro `supabase/migrations/`, non a memoria.
