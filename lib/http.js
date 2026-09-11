// Helper HTTP condivisi dalle Vercel Functions in api/ (CommonJS).
// Questa cartella e' fuori da api/, quindi Vercel non la espone come function.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Origine pubblica del sito: PUBLIC_BASE_URL se impostata, altrimenti l'host della richiesta.
 * Senza slash finale.
 */
function publicBaseUrl(req) {
  const fromEnv = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const host = req && req.headers ? req.headers['x-forwarded-host'] || req.headers.host : '';
  if (!host) return '';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

/**
 * Consente solo richieste same-origin (o senza header Origin, es. curl/Stripe).
 * Non imposta MAI Access-Control-Allow-Origin: le chiamate cross-origin dal browser falliscono.
 * Ritorna true se la richiesta puo' proseguire, false se e' gia' stata rifiutata.
 */
function sameOriginOnly(req, res) {
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    // Nessun header CORS: un preflight cross-origin viene rifiutato dal browser.
    res.status(204).end();
    return false;
  }

  const origin = req.headers.origin;
  if (!origin) return true;

  const allowed = new Set();
  const base = publicBaseUrl(req);
  if (base) allowed.add(base);
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host) {
    allowed.add(`https://${host}`);
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) allowed.add(`http://${host}`);
  }

  if (!allowed.has(origin.replace(/\/+$/, ''))) {
    res.status(403).json({ error: 'forbidden_origin' });
    return false;
  }
  return true;
}

/** Body JSON: Vercel lo parsa gia' se Content-Type e' application/json, altrimenti proviamo noi. */
function readJsonBody(req) {
  const body = req.body;
  if (body == null) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (_) { return null; }
  }
  if (Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString('utf8')); } catch (_) { return null; }
  }
  return typeof body === 'object' ? body : null;
}

/** IP del client dietro al proxy Vercel. */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Rate limit best-effort in memoria (per istanza; su Vercel non e' condiviso tra istanze,
 * ma ferma i loop accidentali e gli abusi banali).
 */
function createRateLimiter({ windowMs = 60000, max = 10 } = {}) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
      }
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

function cleanString(value, maxLen) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLen);
}

module.exports = { publicBaseUrl, sameOriginOnly, readJsonBody, clientIp, createRateLimiter, isEmail, cleanString };
