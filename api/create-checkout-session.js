// Vercel Function: crea una Stripe Checkout Session (pagina di pagamento ospitata da Stripe).
// POST JSON { amount (EUR), itemType, itemName, itemDescription, userEmail, userName,
//             bookingKind, bookingId, metadata, cancelPath }
// Risposta: { url, id }  ->  il client fa window.location.href = url
// Env: STRIPE_SECRET_KEY (obbligatoria), PUBLIC_BASE_URL (consigliata).
// Il pagamento viene registrato dal webhook (api/stripe-webhook.js), non dal client.

const { publicBaseUrl, sameOriginOnly, readJsonBody, clientIp, createRateLimiter, isEmail, cleanString } = require('../lib/http');
const { isSafeId } = require('../lib/supabase-admin');

const ITEM_TYPES = new Set(['tour', 'restaurant', 'spa', 'last_minute', 'room_service']);
const BOOKING_KINDS = new Set(['restaurant', 'spa', 'tour']);
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 2000;

// Pagine locali a cui e' consentito tornare se l'ospite annulla su Stripe.
const CANCEL_PATHS = new Set([
  '/index.html', '/lastminute.html', '/spa.html', '/tours.html', '/tour-detail.html',
  '/ristorante.html', '/account.html', '/dynamic-home.html',
  '/', '/lastminute', '/spa', '/tours', '/tour-detail', '/ristorante'
]);

const allow = createRateLimiter({ windowMs: 60000, max: 20 });

function resolveCancelPath(raw) {
  if (typeof raw !== 'string' || !raw) return '/index.html';
  let path = raw;
  try {
    // Accetta sia un path che un URL completo: teniamo solo il pathname.
    if (/^https?:\/\//i.test(raw)) path = new URL(raw).pathname;
  } catch (_) {
    return '/index.html';
  }
  path = path.split('?')[0].split('#')[0];
  return CANCEL_PATHS.has(path) ? path : '/index.html';
}

/** Metadata Stripe: solo stringhe, max 50 chiavi / 500 char per valore. */
function toStripeMetadata(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input).slice(0, 30)) {
    const key = cleanString(k, 40).replace(/[^\w.-]/g, '_');
    if (!key || v == null) continue;
    const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
    out[key] = value.slice(0, 450);
  }
  return out;
}

module.exports = async (req, res) => {
  if (!sameOriginOnly(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!allow(clientIp(req))) {
    res.status(429).json({ error: 'rate_limited', message: 'Troppe richieste, riprova tra un minuto.' });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[checkout] STRIPE_SECRET_KEY mancante');
    res.status(503).json({ error: 'payments_not_configured', message: 'Pagamento online non disponibile al momento.' });
    return;
  }

  const body = readJsonBody(req);
  if (!body) {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  // ---- Validazione ----
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    res.status(400).json({ error: 'invalid_amount', message: `Importo non valido (min ${MIN_AMOUNT} €, max ${MAX_AMOUNT} €).` });
    return;
  }
  const amountCents = Math.round(amount * 100);

  const itemType = cleanString(body.itemType, 30);
  if (!ITEM_TYPES.has(itemType)) {
    res.status(400).json({ error: 'invalid_item_type' });
    return;
  }

  const userEmail = cleanString(body.userEmail, 254).toLowerCase();
  if (!isEmail(userEmail)) {
    res.status(400).json({ error: 'invalid_email', message: 'Indirizzo email non valido.' });
    return;
  }

  const itemName = cleanString(body.itemName, 120) || 'Servizio';
  const itemDescription = cleanString(body.itemDescription, 300);
  const userName = cleanString(body.userName, 100);

  let bookingKind = cleanString(body.bookingKind, 20);
  let bookingId = body.bookingId == null ? '' : String(body.bookingId).trim();
  if (bookingKind && !BOOKING_KINDS.has(bookingKind)) {
    res.status(400).json({ error: 'invalid_booking_kind' });
    return;
  }
  if (bookingId && !isSafeId(bookingId)) {
    res.status(400).json({ error: 'invalid_booking_id' });
    return;
  }
  if (!bookingKind || !bookingId) { bookingKind = ''; bookingId = ''; }

  const base = publicBaseUrl(req);
  if (!base) {
    res.status(500).json({ error: 'base_url_missing' });
    return;
  }
  const cancelPath = resolveCancelPath(body.cancelPath || body.cancelUrl);

  const metadata = {
    ...toStripeMetadata(body.metadata),
    itemType,
    itemName: itemName.slice(0, 200),
    userEmail,
    userName,
    bookingKind,
    bookingId
  };

  // ---- Stripe ----
  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(secretKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: userEmail,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: amountCents,
          product_data: {
            name: itemName,
            ...(itemDescription ? { description: itemDescription } : {})
          }
        }
      }],
      metadata,
      payment_intent_data: { metadata },
      client_reference_id: bookingKind && bookingId ? `${bookingKind}:${bookingId}` : undefined,
      success_url: `${base}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${cancelPath}${cancelPath.includes('?') ? '&' : '?'}canceled=true`,
      locale: 'it',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60
    });

    res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('[checkout] Stripe error:', err && err.message);
    res.status(502).json({ error: 'stripe_error', message: 'Impossibile avviare il pagamento. Riprova tra poco.' });
  }
};
