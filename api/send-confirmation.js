// Vercel Function: invia l'email di conferma prenotazione (chiamata dal client via booking-notify.js).
// POST JSON { kind, booking_id, email, name, item_name, date, time, people, final_price, room }
// Risposta: 200 { sent:true } | 200 { sent:false, reason:'mail_not_configured' } | 4xx/5xx { sent:false, reason }
// Env: RESEND_API_KEY, MAIL_FROM, MAIL_BCC_STAFF (opzionale), SUPABASE_URL (+ SUPABASE_ANON_KEY per il nome struttura).

const { sameOriginOnly, readJsonBody, clientIp, createRateLimiter, isEmail, cleanString } = require('../lib/http');
const { sendBookingConfirmation, isMailConfigured, VALID_KINDS } = require('../lib/mail');

const allow = createRateLimiter({ windowMs: 60000, max: 10 });
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const TIME_RE = /^\d{1,2}:\d{2}/;

module.exports = async (req, res) => {
  if (!sameOriginOnly(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ sent: false, reason: 'method_not_allowed' });
    return;
  }

  if (!allow(clientIp(req))) {
    res.status(429).json({ sent: false, reason: 'rate_limited' });
    return;
  }

  const body = readJsonBody(req);
  if (!body) {
    res.status(400).json({ sent: false, reason: 'invalid_json' });
    return;
  }

  // ---- Validazione ----
  const kind = cleanString(body.kind, 20);
  if (!VALID_KINDS.includes(kind)) {
    res.status(400).json({ sent: false, reason: 'invalid_kind' });
    return;
  }
  const email = cleanString(body.email, 254).toLowerCase();
  if (!isEmail(email)) {
    res.status(400).json({ sent: false, reason: 'invalid_email' });
    return;
  }

  const bookingId = cleanString(body.booking_id, 40).replace(/[^\w-]/g, '');
  const date = cleanString(body.date, 40);
  const time = cleanString(body.time, 10);
  const peopleNum = Number(body.people);
  const priceNum = Number(body.final_price);

  const details = {
    kind,
    booking_id: bookingId,
    email,
    name: cleanString(body.name, 100),
    item_name: cleanString(body.item_name, 120),
    date: DATE_RE.test(date) ? date.slice(0, 10) : '',
    time: TIME_RE.test(time) ? time : '',
    people: Number.isInteger(peopleNum) && peopleNum > 0 && peopleNum <= 50 ? peopleNum : '',
    final_price: Number.isFinite(priceNum) && priceNum >= 0 && priceNum <= 10000 ? priceNum : '',
    room: cleanString(body.room, 10),
    paid: false
  };

  // Senza RESEND_API_KEY rispondiamo 200: l'app non deve rompersi.
  if (!isMailConfigured()) {
    res.status(200).json({ sent: false, reason: 'mail_not_configured' });
    return;
  }

  const result = await sendBookingConfirmation(details);
  if (result.sent) {
    res.status(200).json({ sent: true });
  } else {
    res.status(result.reason === 'mail_not_configured' ? 200 : 502).json({ sent: false, reason: result.reason });
  }
};
