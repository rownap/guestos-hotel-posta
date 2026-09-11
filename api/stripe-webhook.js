// Vercel Function: webhook Stripe.
// Endpoint da registrare su Stripe: https://<dominio>/api/stripe-webhook
// Eventi: checkout.session.completed, checkout.session.async_payment_succeeded
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//      (+ RESEND_API_KEY / MAIL_FROM per l'email di conferma, opzionali)
//
// Flusso: verifica firma -> se pagato: inserisce in `payments` (idempotente sul payment_intent),
// aggiorna la prenotazione collegata (metadata.bookingKind/bookingId) -> invia email di conferma.

const sb = require('../lib/supabase-admin');
const { sendBookingConfirmation } = require('../lib/mail');

// Serve il body grezzo per verificare la firma: disattiva il parser di Vercel.
module.exports.config = { api: { bodyParser: false } };

const BOOKING_TABLES = {
  restaurant: { table: 'restaurant_bookings', patch: { payment_status: 'paid', status: 'confirmed' } },
  tour: { table: 'tour_bookings', patch: { payment_status: 'paid', status: 'confirmed' } },
  // spa_bookings ha payment_status dalla migrazione 20260911120000: le tre
  // tabelle di prenotazione si aggiornano ormai allo stesso modo.
  spa: { table: 'spa_bookings', patch: { payment_status: 'paid', status: 'confirmed' } }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === 'string') return resolve(Buffer.from(req.body, 'utf8'));
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function pickMetadataValue(md, ...keys) {
  for (const k of keys) {
    if (md[k] != null && String(md[k]).trim() !== '') return String(md[k]).trim();
  }
  return '';
}

async function handlePaidSession(session) {
  const md = session.metadata || {};
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : (session.payment_intent && session.payment_intent.id) || session.id;

  // ---- Idempotenza: Stripe puo' reinviare lo stesso evento ----
  const existing = await sb.adminSelect('payments', `select=id&stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&limit=1`);
  if (Array.isArray(existing) && existing.length) {
    console.log('[webhook] pagamento già registrato, skip:', paymentIntentId);
    return { duplicate: true };
  }

  const bookingKind = pickMetadataValue(md, 'bookingKind');
  const bookingId = pickMetadataValue(md, 'bookingId');
  const hasBooking = Boolean(BOOKING_TABLES[bookingKind] && sb.isSafeId(bookingId));

  const email = (pickMetadataValue(md, 'userEmail') || (session.customer_details && session.customer_details.email) || session.customer_email || '').toLowerCase();
  const userName = pickMetadataValue(md, 'userName') || (session.customer_details && session.customer_details.name) || '';
  const amount = (session.amount_total || 0) / 100;
  const currency = (session.currency || 'eur').toLowerCase();

  // ---- 1. payments ----
  await sb.adminInsert('payments', {
    stripe_payment_intent_id: paymentIntentId,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
    user_email: email || null,
    user_name: userName || null,
    amount,
    currency,
    status: 'succeeded',
    item_type: pickMetadataValue(md, 'itemType') || null,
    item_id: null,
    item_name: pickMetadataValue(md, 'itemName') || null,
    item_description: null,
    booking_reference: hasBooking ? `${bookingKind}:${bookingId}` : null,
    metadata: { ...md, stripe_session_id: session.id }
  });

  // ---- 2. prenotazione collegata ----
  if (hasBooking) {
    const { table, patch } = BOOKING_TABLES[bookingKind];
    try {
      const rows = await sb.adminUpdate(table, `id=eq.${encodeURIComponent(bookingId)}`, patch);
      if (!Array.isArray(rows) || !rows.length) {
        console.warn(`[webhook] nessuna riga aggiornata in ${table} id=${bookingId}`);
      }
    } catch (err) {
      // Il pagamento e' comunque registrato: non facciamo fallire il webhook (Stripe lo rinvierebbe creando duplicati).
      console.error(`[webhook] update ${table} fallito:`, err.message, err.details || '');
    }
  }

  // ---- 3. email di conferma (best-effort) ----
  if (email) {
    const kind = bookingKind || pickMetadataValue(md, 'itemType') || 'restaurant';
    const result = await sendBookingConfirmation({
      kind,
      booking_id: hasBooking ? bookingId : '',
      email,
      name: userName,
      item_name: pickMetadataValue(md, 'itemName'),
      date: pickMetadataValue(md, 'bookingDate', 'tourDate', 'date'),
      time: pickMetadataValue(md, 'bookingTime', 'time'),
      people: pickMetadataValue(md, 'people', 'num_people'),
      room: pickMetadataValue(md, 'room', 'roomNumber', 'room_number'),
      final_price: amount,
      paid: true
    });
    if (!result.sent) console.warn('[webhook] email non inviata:', result.reason);
  }

  return { duplicate: false };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    console.error('[webhook] STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET mancante');
    res.status(500).json({ error: 'webhook_not_configured' });
    return;
  }
  if (!sb.isConfigured()) {
    console.error('[webhook] SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancante');
    res.status(500).json({ error: 'database_not_configured' });
    return;
  }

  let event;
  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(secretKey);
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[webhook] firma non valida:', err && err.message);
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status !== 'paid') {
          // Es. bonifico in attesa: arrivera' async_payment_succeeded.
          console.log('[webhook] sessione non ancora pagata:', session.id, session.payment_status);
          break;
        }
        await handlePaidSession(session);
        break;
      }
      case 'checkout.session.async_payment_failed':
        console.warn('[webhook] pagamento differito fallito:', event.data.object && event.data.object.id);
        break;
      default:
        // Evento non gestito: ack per evitare retry inutili.
        break;
    }
    res.status(200).json({ received: true });
  } catch (err) {
    // Errore DB/transitorio: 500 cosi' Stripe ritenta (l'idempotenza evita doppioni).
    console.error('[webhook] errore elaborazione:', err && err.message, err && err.details ? err.details : '');
    res.status(500).json({ error: 'processing_failed' });
  }
};
