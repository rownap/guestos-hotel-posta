// Invio email di conferma prenotazione con Resend.
// Usato da api/send-confirmation.js (chiamata dal client) e da api/stripe-webhook.js (dopo il pagamento).
// Env: RESEND_API_KEY (obbligatoria per inviare), MAIL_FROM (mittente verificato), MAIL_BCC_STAFF (opzionale).

const { getHotelSettings } = require('./supabase-admin');

const KIND_LABELS = {
  restaurant: 'Tavolo al ristorante',
  spa: 'Trattamento Spa',
  tour: 'Escursione',
  last_minute: 'Offerta Last Minute',
  room_service: 'Servizio in camera'
};

const VALID_KINDS = Object.keys(KIND_LABELS);

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEuro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return String(value);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatTime(value) {
  if (!value) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(value);
}

function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Costruisce subject + HTML + testo dell'email di conferma.
 * `details`: { kind, booking_id, name, item_name, date, time, people, final_price, room, paid }
 */
function buildConfirmationEmail(details, hotel) {
  const hotelName = hotel.name || 'la struttura';
  const label = KIND_LABELS[details.kind] || 'Prenotazione';
  const rows = [];

  if (details.item_name) rows.push(['Servizio', details.item_name]);
  if (details.date) rows.push(['Data', formatDate(details.date)]);
  if (details.time) rows.push(['Orario', formatTime(details.time)]);
  if (details.people) rows.push(['Persone', String(details.people)]);
  if (details.room) rows.push(['Camera', String(details.room)]);
  if (details.final_price != null && details.final_price !== '') {
    rows.push([details.paid ? 'Importo pagato' : 'Importo', formatEuro(details.final_price)]);
  }
  if (details.booking_id) rows.push(['Riferimento', `#${details.booking_id}`]);

  const greeting = details.name ? `Gentile ${escapeHtml(details.name)},` : 'Gentile ospite,';
  const statusLine = details.paid
    ? 'abbiamo ricevuto il pagamento e la prenotazione è confermata.'
    : 'abbiamo registrato la tua prenotazione. Riceverai conferma definitiva dalla reception.';

  const phoneHtml = hotel.reception_phone
    ? `<p style="margin:0 0 8px">Per modifiche o domande contatta la reception: <strong>${escapeHtml(hotel.reception_phone)}</strong>.</p>`
    : '<p style="margin:0 0 8px">Per modifiche o domande contatta la reception.</p>';

  const rowsHtml = rows.map(([k, v]) => `
        <tr>
          <td style="padding:8px 12px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #eef0f3">${escapeHtml(k)}</td>
          <td style="padding:8px 12px;color:#111827;font-weight:600;border-bottom:1px solid #eef0f3">${escapeHtml(v)}</td>
        </tr>`).join('');

  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">
      <div style="background:#0f766e;color:#ffffff;padding:20px 24px">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85">${escapeHtml(hotelName)}</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px">Conferma: ${escapeHtml(label)}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">${greeting}</p>
        <p style="margin:0 0 20px">${statusLine}</p>
        <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:12px;overflow:hidden">${rowsHtml}
        </table>
        <div style="margin-top:20px;font-size:14px;color:#374151">
          ${phoneHtml}
          <p style="margin:0">Puoi rivedere le tue prenotazioni nella sezione <strong>Account</strong> dell'app.</p>
        </div>
      </div>
      <div style="padding:14px 24px;background:#f9fafb;color:#9ca3af;font-size:12px;text-align:center">
        ${escapeHtml(hotelName)}${hotel.city ? ' · ' + escapeHtml(hotel.city) : ''} · Email automatica, non rispondere a questo messaggio.
      </div>
    </div>
  </div>
</body></html>`;

  const text = [
    `${hotelName} - Conferma: ${label}`,
    '',
    details.name ? `Gentile ${details.name},` : 'Gentile ospite,',
    statusLine.charAt(0).toUpperCase() + statusLine.slice(1),
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    hotel.reception_phone ? `Reception: ${hotel.reception_phone}` : 'Per modifiche contatta la reception.'
  ].join('\n');

  const subject = `${hotelName} · ${label}${details.item_name ? ': ' + details.item_name : ''} · conferma`;
  return { subject, html, text };
}

/**
 * Invia l'email di conferma. Non lancia mai: ritorna { sent:boolean, reason?, id? }.
 * @param {object} details  { kind, booking_id, email, name, item_name, date, time, people, final_price, room, paid }
 */
async function sendBookingConfirmation(details) {
  if (!isMailConfigured()) {
    return { sent: false, reason: 'mail_not_configured' };
  }
  if (!details || !details.email) {
    return { sent: false, reason: 'missing_email' };
  }

  let from = (process.env.MAIL_FROM || '').trim();
  if (!from) {
    // Mittente di test di Resend: recapita SOLO all'indirizzo del proprietario dell'account.
    from = 'GuestOS <onboarding@resend.dev>';
    console.warn('[mail] MAIL_FROM non impostata: uso onboarding@resend.dev (solo per test).');
  }

  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const hotel = await getHotelSettings();
    const { subject, html, text } = buildConfirmationEmail(details, hotel);

    const payload = { from, to: [details.email], subject, html, text };
    const bcc = (process.env.MAIL_BCC_STAFF || '').split(',').map(s => s.trim()).filter(Boolean);
    if (bcc.length) payload.bcc = bcc;

    const { data, error } = await resend.emails.send(payload);
    if (error) {
      console.error('[mail] Resend error:', error);
      return { sent: false, reason: 'send_failed' };
    }
    return { sent: true, id: data && data.id };
  } catch (err) {
    console.error('[mail] send exception:', err && err.message);
    return { sent: false, reason: 'send_failed' };
  }
}

module.exports = { sendBookingConfirmation, buildConfirmationEmail, isMailConfigured, VALID_KINDS, KIND_LABELS, escapeHtml };
