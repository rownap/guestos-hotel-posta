// Accesso a Supabase via REST (PostgREST) dalle Vercel Functions, senza SDK.
// - Scritture: SUPABASE_SERVICE_ROLE_KEY (solo server, MAI nel client).
// - Letture pubbliche (hotel_settings): SUPABASE_ANON_KEY se presente, altrimenti la service role.

const ID_RE = /^([0-9]{1,12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function baseUrl() {
  return (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

function isConfigured() {
  return Boolean(baseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Id prenotazione valido (intero o uuid): evita injection nei filtri PostgREST. */
function isSafeId(value) {
  return typeof value === 'string' || typeof value === 'number' ? ID_RE.test(String(value)) : false;
}

async function request(method, path, { key, body, prefer } = {}) {
  const url = baseUrl();
  if (!url || !key) throw new Error('supabase_not_configured');

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = text; }
  }
  if (!res.ok) {
    const err = new Error(`supabase_${method.toLowerCase()}_failed:${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** SELECT con service role. `query` e' la query string PostgREST (gia' codificata). */
function adminSelect(table, query) {
  return request('GET', `${table}?${query}`, { key: serviceKey() });
}

/** INSERT di una riga con service role; ritorna la riga creata. */
async function adminInsert(table, row) {
  const rows = await request('POST', table, { key: serviceKey(), body: row, prefer: 'return=representation' });
  return Array.isArray(rows) ? rows[0] : rows;
}

/** UPDATE con filtro PostgREST (es. `id=eq.12`); ritorna le righe aggiornate. */
function adminUpdate(table, filter, patch) {
  return request('PATCH', `${table}?${filter}`, { key: serviceKey(), body: patch, prefer: 'return=representation' });
}

// ---- hotel_settings (lettura pubblica, con cache e default) ----

const DEFAULT_SETTINGS = {
  name: 'Hotel Posta',
  city: '',
  reception_phone: '',
  checkout_time: ''
};

let settingsCache = { at: 0, value: null };
const SETTINGS_TTL_MS = 5 * 60 * 1000;

/**
 * Legge hotel_settings id=1. Non lancia mai: se la tabella non esiste ancora o la env manca,
 * ritorna i valori di default.
 */
async function getHotelSettings() {
  const now = Date.now();
  if (settingsCache.value && now - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;

  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  let value = { ...DEFAULT_SETTINGS };
  try {
    const rows = await request('GET', 'hotel_settings?select=name,city,reception_phone,checkout_time&id=eq.1&limit=1', { key });
    if (Array.isArray(rows) && rows[0]) {
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (rows[0][k] != null && String(rows[0][k]).trim()) value[k] = String(rows[0][k]).trim();
      }
    }
  } catch (err) {
    console.warn('[supabase-admin] hotel_settings non disponibile, uso i default:', err.message);
  }
  settingsCache = { at: now, value };
  return value;
}

module.exports = { isConfigured, isSafeId, adminSelect, adminInsert, adminUpdate, getHotelSettings, DEFAULT_SETTINGS };
