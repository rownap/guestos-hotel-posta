/**
 * GUESTOS ADMIN - FEATURES MODULE
 * Caricato da guestos-admin-dashboard.html DOPO config.js e DOPO lo script inline
 * della dashboard.
 *
 * Sicurezza:
 *  - La sessione admin e' un TOKEN emesso da admin_login() e salvato in
 *    localStorage.guestos_admin_token. Non esiste piu' nessuna "sessione" finta
 *    in localStorage, e nessuna scrittura passa dalla chiave pubblica.
 *  - Con la RLS attiva le tabelle protette (users, *_bookings, user_points,
 *    user_rewards, guest_staff_notes, admin_audit_log) NON sono leggibili dal
 *    browser: ogni lettura e ogni scrittura passa da una RPC `admin_*`
 *    SECURITY DEFINER che verifica il token e scrive admin_audit_log.
 *  - Tutto cio' che finisce in innerHTML passa da escapeHtml().
 *  - Niente onclick con stringhe interpolate: data-attribute + addEventListener.
 *
 * Le RPC ancora da implementare lato database sono elencate in
 * scratchpad/handoff-admin.md con la firma esatta attesa qui.
 */

// ============================================
// 0. HELPER CONDIVISI (window.AdminOS)
// ============================================
(function () {
    'use strict';

    var TOKEN_KEY = 'guestos_admin_token';
    var PROFILE_KEY = 'guestos_admin_profile';
    var LEGACY_KEY = 'guestos_admin_session';
    var LOGIN_URL = 'guestos-admin-login.html';

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function safeRemove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* storage non disponibile */ }
    }

    // Residuo del vecchio login finto: va via sempre, ovunque.
    safeRemove(LEGACY_KEY);

    function adminToken() {
        var t = safeGet(TOKEN_KEY);
        return t && t.length >= 16 ? t : null;
    }

    function adminProfile() {
        try { return JSON.parse(safeGet(PROFILE_KEY) || 'null'); } catch (e) { return null; }
    }

    function clearAdminSession() {
        safeRemove(TOKEN_KEY);
        safeRemove(PROFILE_KEY);
        safeRemove(LEGACY_KEY);
    }

    function goToLogin(reason) {
        clearAdminSession();
        if (/guestos-admin-login\.html/.test(window.location.pathname)) return;
        window.location.replace(LOGIN_URL + (reason ? '?reason=' + encodeURIComponent(reason) : ''));
    }

    // --- Errori --------------------------------------------------------
    var ERROR_MESSAGES = {
        NOT_AUTHORIZED: 'Non hai i permessi per questa operazione.',
        SESSION_INVALID: 'Sessione scaduta. Accedi di nuovo.',
        SESSION_EXPIRED: 'Sessione scaduta. Accedi di nuovo.',
        INVALID_CREDENTIALS: 'Credenziali non corrette.',
        TOO_MANY_ATTEMPTS: 'Troppi tentativi. Riprova tra 10 minuti.',
        RATE_LIMITED: 'Troppi tentativi. Riprova piu\' tardi.',
        NOT_FOUND: 'Elemento non trovato.',
        INVALID_INPUT: 'Dati non validi.',
        INVALID_DATE: 'Data non valida.',
        ROOM_OCCUPIED: 'Camera gia\' occupata.',
        RPC_MISSING: 'Questa funzione non e\' ancora attiva sul database.',
        NO_CLIENT: 'Connessione al server non disponibile.',
        NETWORK: 'Server non raggiungibile. Controlla la connessione.'
    };

    function AdminError(code, message, original) {
        this.name = 'AdminError';
        this.code = code;
        this.message = message || ERROR_MESSAGES[code] || 'Errore imprevisto.';
        this.original = original;
    }
    AdminError.prototype = Object.create(Error.prototype);
    AdminError.prototype.constructor = AdminError;

    // PostgREST risponde PGRST202 quando la funzione (o quella firma) non esiste.
    function isMissingFunction(err) {
        if (!err) return false;
        if (err.code === 'PGRST202' || err.code === '42883') return true;
        var msg = String(err.message || '');
        return /Could not find the function|does not exist|schema cache/i.test(msg);
    }

    function normalizeError(err, rpcName) {
        var raw = String((err && (err.message || err.msg)) || err || '').trim();
        if (isMissingFunction(err)) {
            return new AdminError('RPC_MISSING',
                'Funzione "' + rpcName + '" non ancora disponibile sul database.', err);
        }
        if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
            return new AdminError('NETWORK', ERROR_MESSAGES.NETWORK, err);
        }
        var m = /^([A-Z_]{4,40})(?::\s*(.*))?$/.exec(raw);
        var code = m ? m[1] : 'RPC_ERROR';
        var message = ERROR_MESSAGES[code] || (m && m[2]) || raw || 'Errore imprevisto.';
        if (code === 'NOT_AUTHORIZED' || code === 'SESSION_INVALID' || code === 'SESSION_EXPIRED') {
            goToLogin('expired');
        }
        return new AdminError(code, message, err);
    }

    function client() {
        return window.supabaseClient || null;
    }

    /**
     * adminRpc(nome, params) -> dati (gia' spacchettati) oppure lancia AdminError.
     *
     * Inietta sempre p_admin_token come da contratto. Alcune RPC gia' in
     * produzione (extend_stay, admin_adjust_points) prendono l'identita' solo
     * dall'header x-admin-token che config.js spedisce a ogni chiamata: se la
     * firma con p_admin_token non esiste, si riprova una volta senza. Cosi' la
     * console funziona sia con lo schema attuale sia con quello convergente.
     */
    async function adminRpc(name, params) {
        var sb = client();
        if (!sb) throw new AdminError('NO_CLIENT');

        var token = adminToken();
        if (!token) {
            goToLogin('expired');
            throw new AdminError('SESSION_INVALID');
        }

        var payload = Object.assign({ p_admin_token: token }, params || {});
        var res = await sb.rpc(name, payload);

        if (res.error && isMissingFunction(res.error)) {
            var fallback = await sb.rpc(name, params || {});
            if (!fallback.error) return fallback.data;
            if (!isMissingFunction(fallback.error)) throw normalizeError(fallback.error, name);
            throw normalizeError(res.error, name);
        }

        if (res.error) throw normalizeError(res.error, name);
        return res.data;
    }

    /**
     * Guardia admin: verifica il token con admin_me().
     * Token assente o scaduto -> pulisce tutto e torna al login.
     * Ritorna il profilo admin oppure null (dopo aver avviato il redirect).
     */
    async function requireAdmin() {
        if (!adminToken()) { goToLogin(); return null; }
        try {
            var data = await adminRpc('admin_me', {});
            var me = Array.isArray(data) ? data[0] : data;
            if (!me) { goToLogin('expired'); return null; }
            var profile = Object.assign({}, adminProfile() || {}, me);
            try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ }
            window.AdminOS.profile = profile;
            window.AdminOS.ready = true;
            return profile;
        } catch (err) {
            // Se admin_me non esiste ancora, non si puo' verificare nulla: meglio
            // fermarsi qui che far credere all'operatore di essere autenticato.
            console.error('requireAdmin:', err.code, err.message);
            goToLogin(err.code === 'RPC_MISSING' ? 'expired' : 'expired');
            return null;
        }
    }

    async function adminLogout() {
        try { await adminRpc('admin_logout', {}); } catch (e) { /* il token locale va via comunque */ }
        clearAdminSession();
        window.location.replace(LOGIN_URL);
    }

    window.AdminOS = Object.assign(window.AdminOS || {}, {
        token: adminToken,
        profile: adminProfile(),
        ready: false,
        settings: null,
        rpc: adminRpc,
        requireAdmin: requireAdmin,
        logout: adminLogout,
        clearSession: clearAdminSession,
        escapeHtml: escapeHtml,
        AdminError: AdminError,
        errorMessage: function (err) { return (err && err.message) || 'Errore imprevisto.'; }
    });

    if (typeof window.escapeHtml !== 'function') window.escapeHtml = escapeHtml;
    // Alias storici usati dalle pagine admin
    window.requireAdmin = requireAdmin;
    window.adminLogout = adminLogout;
    window.adminRpc = adminRpc;
})();

const esc = window.AdminOS.escapeHtml;
const adminRpc = window.AdminOS.rpc;

// ============================================
// GLOBAL STATE + UTILITY
// ============================================
window.adminFeatures = {
    allStays: [],
    allBookings: { restaurant: [], tour: [], spa: [] },
    allPoints: [],
    allRewards: []
};

const STATUS_LABELS = {
    'pending': 'In attesa',
    'confirmed': 'Confermata',
    'completed': 'Completata',
    'cancelled': 'Annullata'
};
const STATUS_CLASSES = ['pending', 'confirmed', 'completed', 'cancelled', 'active', 'expired'];

function safeStatusClass(status) {
    return STATUS_CLASSES.includes(status) ? status : 'pending';
}

function formatMoney(v) {
    const n = Number(v);
    return '€' + (isFinite(n) ? n : 0).toFixed(2);
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

window.formatDate = function (dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const formatDate = window.formatDate;

function nights(from, to) {
    const a = new Date(from), b = new Date(to);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.max(Math.ceil((b - a) / 86400000), 0);
}

function nightsLabel(n) {
    return n + ' ' + (n === 1 ? 'notte' : 'notti');
}

function rowsOf(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    return data ? [data] : [];
}

function firstOf(data) {
    return Array.isArray(data) ? (data[0] || null) : (data || null);
}

// Messaggio di errore dentro un contenitore, senza HTML iniettato.
function showContainerError(container, err) {
    if (!container) return;
    const msg = (err && err.message) || 'Errore caricamento dati';
    container.innerHTML = '<div class="loading" style="color:#d32f2f;">❌ ' + esc(msg) + '</div>';
}

function emptyState(icon, title, text) {
    return `
        <div class="empty-state">
            <div class="empty-icon">${esc(icon)}</div>
            <div class="empty-title">${esc(title)}</div>
            ${text ? `<div class="empty-text">${esc(text)}</div>` : ''}
        </div>
    `;
}

function statusSelect(type, id) {
    return `
        <select data-action="change-status" data-type="${esc(type)}" data-id="${esc(id)}"
                style="padding: 8px; border-radius: 8px; border: 2px solid rgba(0,0,0,0.1); font-weight: 700; font-size: 12px;">
            <option value="">Cambia...</option>
            <option value="confirmed">Conferma</option>
            <option value="completed">Completata</option>
            <option value="cancelled">Annulla</option>
        </select>`;
}

// ============================================
// 1. IMPOSTAZIONI STRUTTURA (hotel_settings)
// ============================================
// Lettura: pubblica (policy public_read su hotel_settings, quindi la select
// diretta qui sotto e' voluta e non e' un buco: la tabella non contiene dati
// personali e la stessa riga la legge anche api/chat.js).
// Scrittura: RPC admin_update_hotel_settings(p_payload jsonb).
//
// ATTENZIONE: hotel_settings NON ha ancora le colonne `timezone` e
// `primary_color`, e admin_update_hotel_settings non le salva. I due campi
// restano nel form ma vengono ignorati dal server finche' la sessione che
// possiede il database non aggiunge colonna + assegnazione nella RPC.
const DEFAULT_TOTAL_ROOMS = 50;
// Campi che il server accetta oggi. Gli altri sono marcati "non ancora salvato".
const SETTINGS_PERSISTED = new Set([
    'name', 'city', 'total_rooms', 'restaurant_hours', 'spa_hours',
    'reception_phone', 'checkout_time', 'wifi_note', 'welcome_message',
    'ai_extra_instructions'
]);

const SETTINGS_FIELDS = [
    { key: 'name', label: 'Nome struttura', type: 'text', placeholder: 'Hotel Posta' },
    { key: 'city', label: 'Citta\'', type: 'text', placeholder: 'Tropea, Calabria' },
    { key: 'total_rooms', label: 'Camere totali', type: 'number', placeholder: '50' },
    { key: 'timezone', label: 'Fuso orario', type: 'text', placeholder: 'Europe/Rome' },
    { key: 'restaurant_hours', label: 'Orari ristorante', type: 'text', placeholder: '12:30-14:30 e 19:30-22:00' },
    { key: 'spa_hours', label: 'Orari spa', type: 'text', placeholder: '10:00-20:00' },
    { key: 'reception_phone', label: 'Telefono reception', type: 'text', placeholder: 'digita 0 dal telefono della camera' },
    { key: 'checkout_time', label: 'Orario check-out', type: 'text', placeholder: '11:00' },
    { key: 'wifi_note', label: 'Nota WiFi', type: 'text', placeholder: 'WiFi gratuito in tutta la struttura' },
    { key: 'primary_color', label: 'Colore principale', type: 'color', placeholder: '#667eea' },
    { key: 'welcome_message', label: 'Messaggio di benvenuto', type: 'textarea', placeholder: 'Mostrato agli ospiti all\'accesso' },
    { key: 'ai_extra_instructions', label: 'Istruzioni extra per l\'AI', type: 'textarea', placeholder: 'Regole aggiuntive per il receptionist virtuale' }
];

window.loadHotelSettings = async function () {
    try {
        const sb = window.supabaseClient;
        if (!sb) return null;
        const { data, error } = await sb.from('hotel_settings').select('*').eq('id', 1).maybeSingle();
        if (error) {
            console.warn('hotel_settings non disponibile:', error.message);
            return null;
        }
        window.AdminOS.settings = data || null;
        return window.AdminOS.settings;
    } catch (e) {
        console.warn('hotel_settings:', e);
        return null;
    }
};

window.totalRooms = function () {
    const n = parseInt(window.AdminOS.settings && window.AdminOS.settings.total_rooms, 10);
    return n > 0 ? n : DEFAULT_TOTAL_ROOMS;
};

function settingsField(field, value) {
    const id = 'set-' + field.key;
    const v = value === null || value === undefined ? '' : String(value);
    const common = `id="${esc(id)}" data-setting="${esc(field.key)}" style="width:100%; padding:14px; border:2px solid rgba(0,0,0,0.08); border-radius:14px; font-weight:600; font-size:14px; font-family:inherit;"`;

    let input;
    if (field.type === 'textarea') {
        input = `<textarea ${common} rows="3" placeholder="${esc(field.placeholder || '')}">${esc(v)}</textarea>`;
    } else if (field.type === 'color') {
        const color = /^#[0-9a-f]{6}$/i.test(v) ? v : '#667eea';
        input = `<input type="color" ${common} value="${esc(color)}" style="width:80px; height:48px; padding:4px; border:2px solid rgba(0,0,0,0.08); border-radius:14px;">`;
    } else {
        input = `<input type="${esc(field.type)}" ${common} value="${esc(v)}" placeholder="${esc(field.placeholder || '')}">`;
    }

    const pending = SETTINGS_PERSISTED.has(field.key)
        ? ''
        : '<div style="font-size:11px; color:#ff6f00; font-weight:700; margin-top:6px;">Non ancora salvato dal server</div>';

    return `
        <div style="margin-bottom:18px;">
            <label for="${esc(id)}" style="display:block; font-size:12px; font-weight:800; color:#999; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">${esc(field.label)}</label>
            ${input}
            ${pending}
        </div>
    `;
}

window.loadSettingsSection = async function () {
    const container = document.getElementById('settings-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">⏳ Caricamento impostazioni...</div>';
    const settings = await window.loadHotelSettings();

    if (!settings) {
        container.innerHTML = emptyState('⚙️', 'Impostazioni non disponibili',
            'La tabella hotel_settings non risponde. Riprova o contatta l\'assistenza.');
        return;
    }

    const half = SETTINGS_FIELDS.filter(f => f.type !== 'textarea');
    const full = SETTINGS_FIELDS.filter(f => f.type === 'textarea');

    container.innerHTML = `
        <form id="hotelSettingsForm" autocomplete="off">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:0 20px;">
                ${half.map(f => settingsField(f, settings[f.key])).join('')}
            </div>
            ${full.map(f => settingsField(f, settings[f.key])).join('')}
            <div id="settingsFeedback" style="margin-bottom:16px; font-weight:700;"></div>
            <button type="submit" class="action-btn" id="saveSettingsBtn"
                style="background:linear-gradient(135deg,#667eea,#764ba2); color:white;">
                💾 Salva impostazioni
            </button>
        </form>
        <div style="margin-top:16px; font-size:12px; color:#999; font-weight:600;">
            Queste informazioni compaiono nelle pagine ospite e nel prompt del receptionist virtuale.
        </div>
    `;

    document.getElementById('hotelSettingsForm').addEventListener('submit', saveHotelSettings);
};

async function saveHotelSettings(e) {
    e.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    const feedback = document.getElementById('settingsFeedback');
    feedback.textContent = '';
    btn.disabled = true;
    btn.textContent = '⏳ Salvataggio...';

    const payload = {};
    SETTINGS_FIELDS.forEach(f => {
        const el = document.getElementById('set-' + f.key);
        if (!el) return;
        if (f.type === 'number') {
            const n = parseInt(el.value, 10);
            payload[f.key] = isNaN(n) ? null : n;
        } else {
            payload[f.key] = el.value.trim();
        }
    });

    try {
        const data = await adminRpc('admin_update_hotel_settings', { p_payload: payload });
        window.AdminOS.settings = firstOf(data) || Object.assign({ id: 1 }, payload);
        feedback.style.color = '#00c853';
        feedback.textContent = '✅ Impostazioni salvate.';
        if (typeof updateQuickStats === 'function') updateQuickStats();
        const hotelNameEl = document.getElementById('hotelName');
        if (hotelNameEl && payload.name) hotelNameEl.textContent = payload.name;
    } catch (err) {
        console.error('saveHotelSettings:', err);
        feedback.style.color = '#d32f2f';
        feedback.textContent = '❌ ' + err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Salva impostazioni';
    }
}

// ============================================
// 2. OVERVIEW + ANALYTICS (RPC admin_*)
// ============================================
window.loadOverviewStats = async function () {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    try {
        // admin_overview_stats() restituisce:
        // {active_stays, checkins_today, checkouts_today, guests_total,
        //  points_total, bookings_pending, revenue_30d}
        const stats = firstOf(await adminRpc('admin_overview_stats', {})) || {};
        window.AdminOS.overview = stats;
        set('stat-active-guests', stats.active_stays ?? 0);
        set('stat-checkin-today', stats.checkins_today ?? 0);
        set('stat-checkout-today', stats.checkouts_today ?? 0);
        set('stat-pending-bookings', stats.bookings_pending ?? 0);
    } catch (err) {
        console.error('loadOverviewStats:', err);
        ['stat-active-guests', 'stat-checkin-today', 'stat-checkout-today', 'stat-pending-bookings']
            .forEach(id => set(id, '-'));
    }
};

window.loadAnalytics = async function () {
    await Promise.all([
        loadPointsAnalytics(),
        loadRevenueAnalytics(),
        loadTopGuestsAnalytics()
    ]);
};

async function loadPointsAnalytics() {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    try {
        // admin_points_summary() -> {total_points, avg_points, users_with_points, rewards_claimed}
        const s = firstOf(await adminRpc('admin_points_summary', {})) || {};
        const total = Number(s.total_points ?? (window.AdminOS.overview && window.AdminOS.overview.points_total) ?? 0);
        const users = Number(s.users_with_points || 0);
        const avg = s.avg_points !== undefined && s.avg_points !== null
            ? Number(s.avg_points)
            : (users > 0 ? Math.round(total / users) : 0);
        set('total-points', total.toLocaleString('it-IT'));
        set('total-rewards', Number(s.rewards_claimed || 0));
        set('avg-points', avg.toLocaleString('it-IT') + ' pts');
    } catch (err) {
        console.error('loadPointsAnalytics:', err);
        set('total-points', '-'); set('total-rewards', '-'); set('avg-points', '-');
    }
}

// `payments.item_type` -> colonna mostrata nel riquadro incassi.
const REVENUE_BUCKETS = {
    restaurant: 'restaurant', ristorante: 'restaurant',
    tour: 'tours', tours: 'tours', escursione: 'tours', excursion: 'tours',
    spa: 'spa', wellness: 'spa'
};

async function loadRevenueAnalytics() {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    try {
        // admin_revenue_7d() restituisce un ELENCO di righe
        // [{day, item_type, transactions, revenue}, ...] prese da `payments`:
        // qui si somma per tipo di servizio. Accetta anche la forma compatta
        // {restaurant, tours, spa, total} se un giorno la RPC cambiasse.
        const data = await adminRpc('admin_revenue_7d', {});
        const buckets = { restaurant: 0, tours: 0, spa: 0 };
        let total = 0;

        if (Array.isArray(data)) {
            data.forEach(row => {
                const amount = Number(row.revenue || row.amount || 0);
                total += amount;
                const key = REVENUE_BUCKETS[String(row.item_type || '').toLowerCase()];
                if (key) buckets[key] += amount;
            });
        } else {
            const r = firstOf(data) || {};
            buckets.restaurant = Number(r.restaurant || 0);
            buckets.tours = Number(r.tours || r.tour || 0);
            buckets.spa = Number(r.spa || 0);
            total = r.total !== undefined
                ? Number(r.total)
                : buckets.restaurant + buckets.tours + buckets.spa;
        }

        set('revenue-restaurant', formatMoney(buckets.restaurant));
        set('revenue-tours', formatMoney(buckets.tours));
        set('revenue-spa', formatMoney(buckets.spa));
        set('revenue-total', formatMoney(total));
    } catch (err) {
        console.error('loadRevenueAnalytics:', err);
        ['revenue-restaurant', 'revenue-tours', 'revenue-spa', 'revenue-total'].forEach(id => set(id, '-'));
    }
}

async function loadTopGuestsAnalytics() {
    const container = document.getElementById('top-guests-analytics');
    if (!container) return;
    try {
        const rows = rowsOf(await adminRpc('admin_top_guests', { p_limit: 3 }));
        if (!rows.length) {
            container.innerHTML = '<div style="text-align:center; color:#999; padding:20px; font-size:14px;">Nessun dato</div>';
            return;
        }
        const medals = ['🥇', '🥈', '🥉'];
        container.innerHTML = rows.slice(0, 3).map((u, i) => {
            const label = String(u.user_name || u.user_email || '-');
            const shown = label.length > 20 ? label.slice(0, 17) + '…' : label;
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid rgba(0,0,0,0.05);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:24px;">${medals[i] || ''}</span>
                        <span style="font-size:13px; font-weight:700; color:#666;">${esc(shown)}</span>
                    </div>
                    <div style="font-size:16px; font-weight:900; color:#FF0080;">${Number(u.points || 0).toLocaleString('it-IT')}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('loadTopGuestsAnalytics:', err);
        showContainerError(container, err);
    }
}

// ============================================
// 3. SOGGIORNI ATTIVI / CHECK-IN / CHECK-OUT
// ============================================
function stayActionButtons(stay, variant) {
    const id = esc(stay.id);
    const buttons = [
        `<button type="button" class="btn-icon view" data-action="view-stay" data-id="${id}" title="Dettagli">
            <i data-lucide="eye" style="width:18px;height:18px;"></i></button>`,
        `<button type="button" class="btn-icon edit" data-action="reset-pin" data-id="${id}" title="Reset PIN">
            <i data-lucide="key" style="width:18px;height:18px;"></i></button>`,
        `<button type="button" class="btn-icon edit" data-action="extend-stay" data-id="${id}" title="Prolunga soggiorno">
            <i data-lucide="calendar-plus" style="width:18px;height:18px;"></i></button>`,
        `<button type="button" class="btn-icon edit" data-action="staff-note" data-id="${id}" title="Nota interna">
            <i data-lucide="sticky-note" style="width:18px;height:18px;"></i></button>`
    ];
    if (variant === 'checkout') {
        buttons.push(`<button type="button" class="btn-icon delete" data-action="complete-checkout" data-id="${id}" title="Conferma check-out">
            <i data-lucide="check-circle" style="width:18px;height:18px;"></i></button>`);
    } else {
        buttons.push(`<button type="button" class="btn-icon delete" data-action="deactivate-stay" data-id="${id}" title="Disattiva">
            <i data-lucide="x-circle" style="width:18px;height:18px;"></i></button>`);
    }
    return `<div class="action-buttons">${buttons.join('')}</div>`;
}

window.loadActiveStays = async function () {
    const container = document.getElementById('stays-table-container');
    if (!container) return;
    container.innerHTML = '<div class="loading">⏳ Caricamento soggiorni...</div>';

    try {
        const rows = rowsOf(await adminRpc('admin_list_stays', {}));
        window.adminFeatures.allStays = rows;
        window.allStays = rows; // usato dalla ricerca globale

        if (!rows.length) {
            container.innerHTML = emptyState('🏨', 'Nessun soggiorno attivo', 'Non ci sono ospiti al momento');
            return;
        }
        renderStaysTable(rows);
    } catch (err) {
        console.error('loadActiveStays:', err);
        showContainerError(container, err);
    }
};

window.renderStaysTable = function (stays) {
    const container = document.getElementById('stays-table-container');
    if (!container) return;
    const t = today();

    const body = stays.map(stay => {
        const daysLeft = nights(t, stay.stay_end_date);
        let badge = '<span class="badge active">Attivo</span>';
        if (stay.stay_end_date === t) badge = '<span class="badge pending">Scade oggi</span>';
        else if (daysLeft <= 2) badge = `<span class="badge pending">Scade tra ${daysLeft} giorni</span>`;

        return `
            <tr>
                <td><strong>${esc(stay.room_number)}</strong></td>
                <td>${esc(stay.last_name)}</td>
                <td>${esc(stay.email || '-')}</td>
                <td>${esc(formatDate(stay.stay_start_date))}</td>
                <td>${esc(formatDate(stay.stay_end_date))}</td>
                <td>${badge}</td>
                <td>${stayActionButtons(stay, 'active')}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Camera</th><th>Cognome</th><th>Email</th>
                    <th>Check-in</th><th>Check-out</th><th>Stato</th><th>Azioni</th>
                </tr>
            </thead>
            <tbody>${body}</tbody>
        </table>`;
    if (window.lucide) lucide.createIcons();
};

window.filterStays = function () {
    const room = (document.getElementById('filter-stays-room')?.value || '').toLowerCase();
    const name = (document.getElementById('filter-stays-name')?.value || '').toLowerCase();
    const filtered = window.adminFeatures.allStays.filter(s =>
        String(s.room_number || '').toLowerCase().includes(room) &&
        String(s.last_name || '').toLowerCase().includes(name)
    );
    if (!filtered.length) {
        document.getElementById('stays-table-container').innerHTML =
            emptyState('🔍', 'Nessun risultato', 'Nessun soggiorno corrisponde ai filtri');
        return;
    }
    renderStaysTable(filtered);
};

window.loadCheckinToday = async function () {
    const container = document.getElementById('checkin-today-container');
    if (!container) return;
    container.innerHTML = '<div class="loading">⏳ Caricamento arrivi...</div>';

    try {
        const rows = rowsOf(await adminRpc('admin_checkins_today', {}));
        if (!rows.length) {
            container.innerHTML = emptyState('📥', 'Nessun arrivo oggi');
            return;
        }
        // La colonna PIN resta in tabella ma NON mostra mai un codice: il PIN in
        // chiaro non esiste piu' sul database (users.pin eliminata, ora bcrypt in
        // guest_credentials). Si rigenera solo col pulsante "Reset PIN".
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr><th>Camera</th><th>Cognome</th><th>Email</th><th>Durata</th><th>PIN</th><th>Azioni</th></tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td><strong>${esc(r.room_number)}</strong></td>
                            <td>${esc(r.last_name)}</td>
                            <td>${esc(r.email || '-')}</td>
                            <td>${esc(nightsLabel(nights(r.stay_start_date, r.stay_end_date)))}</td>
                            <td><small style="color:#999; font-weight:700;">PIN non visibile per sicurezza</small></td>
                            <td>${stayActionButtons(r, 'active')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('loadCheckinToday:', err);
        showContainerError(container, err);
    }
};

window.loadCheckoutToday = async function () {
    const container = document.getElementById('checkout-today-container');
    if (!container) return;
    container.innerHTML = '<div class="loading">⏳ Caricamento partenze...</div>';

    try {
        const rows = rowsOf(await adminRpc('admin_checkouts_today', {}));
        if (!rows.length) {
            container.innerHTML = emptyState('📤', 'Nessuna partenza oggi');
            return;
        }
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr><th>Camera</th><th>Cognome</th><th>Email</th><th>Check-in</th><th>Durata totale</th><th>Azioni</th></tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td><strong>${esc(r.room_number)}</strong></td>
                            <td>${esc(r.last_name)}</td>
                            <td>${esc(r.email || '-')}</td>
                            <td>${esc(formatDate(r.stay_start_date))}</td>
                            <td>${esc(nightsLabel(nights(r.stay_start_date, r.stay_end_date)))}</td>
                            <td>${stayActionButtons(r, 'checkout')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('loadCheckoutToday:', err);
        showContainerError(container, err);
    }
};

// ============================================
// 4. SCHEDA OSPITE + AZIONI (RPC admin_*)
// ============================================
function infoRow(label, valueHtml) {
    return `
        <div class="info-row">
            <div class="info-label">${esc(label)}</div>
            <div class="info-value">${valueHtml}</div>
        </div>`;
}

window.viewStay = async function (stayId) {
    const modalBody = document.getElementById('modalStayBody');
    const modal = document.getElementById('modalStayDetails');
    if (!modalBody || !modal) return;

    modalBody.innerHTML = '<div class="loading">⏳ Caricamento scheda...</div>';
    modal.classList.add('active');

    try {
        const data = firstOf(await adminRpc('admin_get_stay', { p_user_id: parseInt(stayId, 10) }));
        if (!data) {
            modalBody.innerHTML = emptyState('👤', 'Ospite non trovato');
            return;
        }

        const total = nights(data.stay_start_date, data.stay_end_date);
        const left = nights(today(), data.stay_end_date);

        modalBody.innerHTML = [
            infoRow('Camera', esc(data.room_number)),
            infoRow('Cognome', esc(data.last_name)),
            infoRow('Email', esc(data.email || '-')),
            // Il PIN in chiaro non esiste piu': la colonna users.pin e' stata eliminata.
            infoRow('PIN', '<span style="color:#999; font-weight:700;">PIN non visibile per sicurezza</span>'),
            infoRow('Check-in', esc(formatDate(data.stay_start_date))),
            infoRow('Check-out', esc(formatDate(data.stay_end_date))),
            infoRow('Durata totale', esc(nightsLabel(total))),
            infoRow('Notti rimanenti', left > 0 ? esc(nightsLabel(left)) : 'Scade oggi'),
            infoRow('Punti', esc(String(data.points ?? 0))),
            infoRow('Stato', data.active
                ? '<span class="badge active">Attivo</span>'
                : '<span class="badge expired">Disattivato</span>'),
            infoRow('Nota interna', data.staff_note
                ? `<span style="font-size:13px;">${esc(data.staff_note)}</span>`
                : '<span style="color:#999;">Nessuna nota</span>')
        ].join('') + `
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:20px;">
                <button type="button" class="action-btn" data-action="reset-pin" data-id="${esc(data.id)}">🔑 Reset PIN</button>
                <button type="button" class="action-btn" data-action="extend-stay" data-id="${esc(data.id)}">📅 Prolunga</button>
                <button type="button" class="action-btn" data-action="staff-note" data-id="${esc(data.id)}">📝 Nota interna</button>
                <button type="button" class="action-btn" disabled
                        title="Disponibile con il modulo email"
                        style="opacity:0.5; cursor:not-allowed;">
                    ✉️ Invia messaggio — disponibile con il modulo email
                </button>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('viewStay:', err);
        showContainerError(modalBody, err);
    }
};

// Reset PIN: il nuovo PIN si vede UNA SOLA VOLTA, poi resta solo l'hash sul server.
window.resetPIN = async function (stayId) {
    if (!confirm('Generare un nuovo PIN per questo ospite?\nIl PIN precedente smettera\' di funzionare.')) return;

    try {
        const data = await adminRpc('admin_reset_guest_pin', { p_user_id: parseInt(stayId, 10) });
        const row = firstOf(data);
        const pin = typeof data === 'string' ? data : (row && (row.pin || row.new_pin)) || '';

        if (!pin) {
            alert('PIN rigenerato, ma il server non ha restituito il codice. Rigenera di nuovo.');
            return;
        }
        showOneTimePin(pin);
        if (typeof loadActiveStays === 'function') loadActiveStays();
    } catch (err) {
        console.error('resetPIN:', err);
        alert('❌ ' + err.message);
    }
};

// Modale "una volta sola": il PIN non viene salvato da nessuna parte nel browser.
function showOneTimePin(pin) {
    const existing = document.getElementById('modalOneTimePin');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay active" id="modalOneTimePin">
            <div class="modal-content" style="max-width:420px; text-align:center;">
                <div class="modal-header" style="justify-content:center;"><span>🔑 Nuovo PIN</span></div>
                <div class="modal-body">
                    <div style="font-size:40px; font-weight:900; letter-spacing:8px; color:#667eea; margin:18px 0;">${esc(pin)}</div>
                    <div style="font-size:13px; color:#666; font-weight:600; line-height:1.6;">
                        Comunicalo subito all'ospite: viene mostrato <strong>una sola volta</strong>
                        e non e\' piu\' recuperabile. Se lo perdi, rigenerane un altro.
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="modal-btn primary" data-action="close-one-time-pin">Ho annotato il PIN</button>
                </div>
            </div>
        </div>
    `);
}

window.deactivateStay = async function (stayId) {
    if (!confirm('Disattivare questo soggiorno?\nL\'ospite non potra\' piu\' accedere all\'app.')) return;
    try {
        await adminRpc('admin_checkout', { p_user_id: parseInt(stayId, 10) });
        alert('✅ Soggiorno disattivato.');
        if (typeof closeModal === 'function') closeModal();
        loadActiveStays();
        loadOverviewStats();
        loadAnalytics();
    } catch (err) {
        console.error('deactivateStay:', err);
        alert('❌ ' + err.message);
    }
};

window.completeCheckout = async function (stayId) {
    if (!confirm('Confermare il check-out?\nIl soggiorno verra\' chiuso e l\'accesso disattivato.')) return;
    try {
        await adminRpc('admin_checkout', { p_user_id: parseInt(stayId, 10) });
        alert('✅ Check-out completato.');
        if (typeof closeModal === 'function') closeModal();
        loadCheckoutToday();
        loadOverviewStats();
        loadAnalytics();
    } catch (err) {
        console.error('completeCheckout:', err);
        alert('❌ ' + err.message);
    }
};

// ============================================
// 5. RICERCA GLOBALE
// ============================================
window.initGlobalSearch = function () {
    const topBar = document.querySelector('#section-overview .top-bar');
    if (!topBar || document.getElementById('globalSearchBar')) return;

    topBar.querySelector('.page-title').insertAdjacentHTML('afterend', `
        <div id="globalSearchBar" style="display:flex; gap:8px; align-items:center; flex:1; max-width:400px; margin-left:20px;">
            <input type="text" id="globalSearch" placeholder="🔍 Cerca ospite (camera, nome, email)..."
                style="flex:1; padding:12px 16px; border:2px solid rgba(0,0,0,0.08); border-radius:14px; font-weight:600; font-size:14px;">
            <button id="globalSearchBtn" type="button"
                style="padding:12px 20px; background:linear-gradient(135deg,#667eea,#764ba2); color:white; border:none; border-radius:14px; font-weight:800; cursor:pointer;">
                Cerca
            </button>
        </div>
    `);

    document.getElementById('globalSearchBtn').addEventListener('click', handleGlobalSearch);
    document.getElementById('globalSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleGlobalSearch();
    });
};

window.handleGlobalSearch = async function () {
    const input = document.getElementById('globalSearch');
    const query = (input?.value || '').trim().toLowerCase();
    if (query.length < 2) {
        alert('Inserisci almeno 2 caratteri per la ricerca.');
        return;
    }

    if (!window.adminFeatures.allStays.length) await loadActiveStays();

    const matches = window.adminFeatures.allStays.filter(s =>
        String(s.room_number || '').toLowerCase().includes(query) ||
        String(s.last_name || '').toLowerCase().includes(query) ||
        String(s.email || '').toLowerCase().includes(query)
    );

    if (!matches.length) {
        alert('Nessun risultato per "' + query + '".');
        return;
    }

    if (typeof showSection === 'function') showSection('stays');
    renderStaysTable(matches);

    const banner = document.createElement('div');
    banner.style.cssText = 'background:rgba(0,200,83,0.1); border:2px solid rgba(0,200,83,0.3); color:#00c853; padding:16px; border-radius:14px; margin-bottom:20px; font-weight:700;';
    banner.textContent = `Trovati ${matches.length} risultati per "${query}"`;
    const container = document.getElementById('stays-table-container');
    container.insertBefore(banner, container.firstChild);
    setTimeout(() => banner.remove(), 5000);
};

// ============================================
// 6. PROLUNGA SOGGIORNO (RPC extend_stay)
// ============================================
window.initExtendStayModal = function () {
    if (document.getElementById('modalExtendStay')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="modalExtendStay">
            <div class="modal-content">
                <div class="modal-header">
                    <i data-lucide="calendar-plus" style="width:28px;height:28px;"></i>
                    <span>Prolunga soggiorno</span>
                </div>
                <div class="modal-body">
                    <label for="extendDays" style="display:block; font-weight:700; margin-bottom:8px; color:#666;">
                        Giorni da aggiungere:
                    </label>
                    <input type="number" id="extendDays" min="1" max="30" placeholder="Es: 3"
                        style="width:100%; padding:14px; border:2px solid rgba(0,0,0,0.08); border-radius:14px; font-weight:700; font-size:16px;">
                    <small style="color:#999; font-weight:600; display:block; margin-top:8px;">Massimo 30 giorni</small>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn danger" type="button" data-action="close-modal">Annulla</button>
                    <button class="modal-btn primary" type="button" data-action="confirm-extend">Conferma</button>
                </div>
            </div>
        </div>
    `);
    if (window.lucide) lucide.createIcons();
};

window.openExtendStayModal = function (stayId) {
    window.initExtendStayModal();
    const input = document.getElementById('extendDays');
    input.value = '';
    input.dataset.stayId = String(stayId);
    document.getElementById('modalExtendStay').classList.add('active');
    input.focus();
};

window.confirmExtendStay = async function () {
    const input = document.getElementById('extendDays');
    const stayId = parseInt(input.dataset.stayId, 10);
    const days = parseInt(input.value, 10);

    if (!stayId || !days || days < 1 || days > 30) {
        alert('Inserisci un numero di giorni valido (1-30).');
        return;
    }

    try {
        const data = await adminRpc('extend_stay', { p_user_id: stayId, p_days: days });
        const row = firstOf(data);
        const newDate = typeof data === 'string' ? data : (row && (row.new_end_date || row.stay_end_date)) || null;

        alert(`✅ Soggiorno prolungato di ${days} ${days === 1 ? 'giorno' : 'giorni'}.` +
            (newDate ? `\nNuovo check-out: ${formatDate(newDate)}` : ''));

        if (typeof closeModal === 'function') closeModal();
        loadActiveStays();
        loadOverviewStats();
    } catch (err) {
        console.error('confirmExtendStay:', err);
        alert('❌ ' + err.message);
    }
};

// ============================================
// 7. NOTE INTERNE STAFF (tabella guest_staff_notes)
// ============================================
// users.staff_notes non esiste piu': le note stanno in guest_staff_notes e
// passano da RPC dedicate.
window.addStaffNote = async function (userId) {
    const id = parseInt(userId, 10);
    let current = '';
    try {
        const data = await adminRpc('admin_get_staff_note', { p_user_id: id });
        const row = firstOf(data);
        current = typeof data === 'string' ? data : (row && (row.note || row.staff_note)) || '';
    } catch (err) {
        if (err.code !== 'RPC_MISSING') console.warn('admin_get_staff_note:', err.message);
    }

    const note = prompt('Nota interna su questo ospite (visibile solo allo staff).\nLascia vuoto per cancellarla.', current);
    if (note === null) return;

    try {
        await adminRpc('admin_set_staff_note', { p_user_id: id, p_note: note.trim() || null });
        alert('✅ Nota salvata.');
        if (typeof loadActiveStays === 'function') loadActiveStays();
    } catch (err) {
        console.error('addStaffNote:', err);
        alert('❌ ' + err.message);
    }
};

window.viewStaffNote = async function (userId) {
    try {
        const data = await adminRpc('admin_get_staff_note', { p_user_id: parseInt(userId, 10) });
        const row = firstOf(data);
        const note = typeof data === 'string' ? data : (row && (row.note || row.staff_note)) || '';
        alert(note ? 'Nota interna:\n\n' + note : 'Nessuna nota per questo ospite.');
    } catch (err) {
        alert('❌ ' + err.message);
    }
};

// ============================================
// 8. PRENOTAZIONI (lettura + cambio stato via RPC)
// ============================================
const BOOKING_SECTIONS = {
    restaurant: { container: 'restaurant-bookings-container', icon: '🍽️' },
    tour: { container: 'tours-bookings-container', icon: '🚌' },
    spa: { container: 'spa-bookings-container', icon: '💆' }
};

async function loadBookings(kind) {
    const cfg = BOOKING_SECTIONS[kind];
    const container = document.getElementById(cfg.container);
    if (!container) return;

    container.innerHTML = '<div class="loading">⏳ Caricamento prenotazioni...</div>';
    try {
        const rows = rowsOf(await adminRpc('admin_list_bookings', { p_kind: kind, p_limit: 100 }));
        window.adminFeatures.allBookings[kind] = rows;

        if (!rows.length) {
            container.innerHTML = emptyState(cfg.icon, 'Nessuna prenotazione');
            return;
        }
        renderBookingsTable(kind, rows);
    } catch (err) {
        console.error('loadBookings ' + kind + ':', err);
        showContainerError(container, err);
    }
}

function renderBookingsTable(kind, bookings) {
    const container = document.getElementById(BOOKING_SECTIONS[kind].container);
    if (!container) return;

    const guestCell = b => `${esc(b.user_name || '-')}<br><small style="color:#999;">${esc(b.user_email || '')}</small>`;
    const statusCell = b => `<span class="badge ${safeStatusClass(b.status)}">${esc(STATUS_LABELS[b.status] || 'Sconosciuto')}</span>`;

    let head, body;
    if (kind === 'restaurant') {
        head = '<th>Data</th><th>Ora</th><th>Ospite</th><th>Camera</th><th>Persone</th><th>Prezzo</th><th>Stato</th><th>Azioni</th>';
        body = bookings.map(b => `
            <tr>
                <td>${esc(formatDate(b.booking_date))}</td>
                <td><strong>${esc(b.booking_time || '-')}</strong></td>
                <td>${guestCell(b)}</td>
                <td>${esc(b.room_number || '-')}</td>
                <td>${parseInt(b.num_people, 10) || 0} persone</td>
                <td>${esc(formatMoney(b.final_price ?? b.original_price))}</td>
                <td>${statusCell(b)}</td>
                <td>${statusSelect('restaurant', b.id)}</td>
            </tr>`).join('');
    } else if (kind === 'tour') {
        head = '<th>Data tour</th><th>Tour</th><th>Ospite</th><th>Persone</th><th>Prezzo</th><th>Stato</th><th>Azioni</th>';
        body = bookings.map(b => `
            <tr>
                <td>${esc(formatDate(b.tour_date || b.booking_date))}</td>
                <td><strong>${esc(b.tour_name || b.item_name || '-')}</strong></td>
                <td>${guestCell(b)}</td>
                <td>${parseInt(b.num_people, 10) || 0} persone</td>
                <td>${esc(formatMoney(b.final_price ?? b.original_price))}</td>
                <td>${statusCell(b)}</td>
                <td>${statusSelect('tour', b.id)}</td>
            </tr>`).join('');
    } else {
        head = '<th>Data</th><th>Ora</th><th>Trattamento</th><th>Ospite</th><th>Durata</th><th>Prezzo</th><th>Stato</th><th>Azioni</th>';
        body = bookings.map(b => `
            <tr>
                <td>${esc(formatDate(b.booking_date))}</td>
                <td><strong>${esc(b.booking_time || '-')}</strong></td>
                <td>${esc(b.treatment_name || b.item_name || '-')}</td>
                <td>${guestCell(b)}</td>
                <td>${esc(b.duration_minutes || '-')} min</td>
                <td>${esc(formatMoney(b.final_price ?? b.original_price))}</td>
                <td>${statusCell(b)}</td>
                <td>${statusSelect('spa', b.id)}</td>
            </tr>`).join('');
    }

    container.innerHTML = `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

window.loadRestaurantBookings = () => loadBookings('restaurant');
window.loadToursBookings = () => loadBookings('tour');
window.loadSpaBookings = () => loadBookings('spa');

window.changeBookingStatus = async function (type, bookingId, newStatus, selectEl) {
    if (!newStatus) return;
    if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, newStatus)) return;

    if (!confirm(`Cambiare stato prenotazione in "${STATUS_LABELS[newStatus]}"?`)) {
        if (selectEl) selectEl.value = '';
        return;
    }

    try {
        await adminRpc('admin_set_booking_status', {
            p_kind: type,
            p_booking_id: parseInt(bookingId, 10),
            p_status: newStatus
        });
        alert('✅ Stato aggiornato.');
        loadBookings(type);
        loadOverviewStats();
        loadAnalytics();
    } catch (err) {
        console.error('changeBookingStatus:', err);
        alert('❌ ' + err.message);
        if (selectEl) selectEl.value = '';
    }
};

// ============================================
// 9. PUNTI (RPC admin_list_points / admin_adjust_points)
// ============================================
window.loadPointsManagement = async function () {
    const container = document.getElementById('points-management-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">⏳ Caricamento punti...</div>';
    try {
        const rows = rowsOf(await adminRpc('admin_list_points', { p_limit: 200 }));
        window.adminFeatures.allPoints = rows;

        if (!rows.length) {
            container.innerHTML = emptyState('⭐', 'Nessun utente con punti');
            return;
        }
        renderPointsTable(rows);
    } catch (err) {
        console.error('loadPointsManagement:', err);
        showContainerError(container, err);
    }
};

window.renderPointsTable = function (users) {
    const container = document.getElementById('points-management-container');
    if (!container) return;

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr><th>Email</th><th>Nome</th><th>Punti</th><th>Livello</th><th>Ultima attivita'</th><th>Azioni</th></tr>
            </thead>
            <tbody>
                ${users.map(u => {
                    const points = parseInt(u.points, 10) || 0;
                    return `
                        <tr>
                            <td><strong>${esc(u.user_email)}</strong></td>
                            <td>${esc(u.user_name || '-')}</td>
                            <td style="font-size:20px; font-weight:900; color:#FF0080;">${points}</td>
                            <td><span class="badge active">Livello ${parseInt(u.level, 10) || 1}</span></td>
                            <td>${esc(u.updated_at ? formatDate(String(u.updated_at).split('T')[0]) : '-')}</td>
                            <td>
                                <button type="button" class="btn-icon edit" data-action="adjust-points"
                                        data-email="${esc(u.user_email)}" data-points="${points}" title="Modifica punti">
                                    <i data-lucide="edit-3" style="width:18px;height:18px;"></i>
                                </button>
                            </td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    if (window.lucide) lucide.createIcons();
};

window.adjustPoints = function (userEmail, currentPoints) {
    const current = parseInt(currentPoints, 10) || 0;
    const input = prompt(
        `Punti attuali: ${current}\n\n` +
        'Inserisci la modifica:\n' +
        '+100  aggiunge 100 punti\n' +
        '-50   toglie 50 punti\n' +
        '=200  imposta a 200 punti'
    );
    if (input === null) return;

    const trimmed = input.trim();
    const amount = parseInt(trimmed.slice(1), 10);
    if (!/^[+\-=]/.test(trimmed) || isNaN(amount)) {
        alert('Formato non valido. Usa +100, -50 oppure =200.');
        return;
    }

    let newPoints = current;
    if (trimmed[0] === '+') newPoints = current + amount;
    else if (trimmed[0] === '-') newPoints = current - amount;
    else newPoints = amount;

    if (newPoints < 0) {
        alert('I punti non possono essere negativi.');
        return;
    }
    if (!confirm(`Confermare la modifica?\n${current} → ${newPoints}`)) return;

    updateUserPoints(userEmail, newPoints);
};

window.updateUserPoints = async function (userEmail, newPoints) {
    try {
        const data = await adminRpc('admin_adjust_points', {
            p_email: userEmail,
            p_new_points: parseInt(newPoints, 10)
        });
        const row = firstOf(data);
        const total = typeof data === 'number' ? data : (row && (row.points ?? row.total)) ?? newPoints;
        alert(`✅ Punti aggiornati: ${total}`);
        loadPointsManagement();
        loadAnalytics();
    } catch (err) {
        console.error('updateUserPoints:', err);
        alert('❌ ' + err.message);
    }
};

// ============================================
// 10. PREMI RISCATTATI
// ============================================
window.loadRewardsManagement = async function () {
    const container = document.getElementById('rewards-management-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">⏳ Caricamento premi...</div>';
    try {
        const rows = rowsOf(await adminRpc('admin_list_rewards', { p_limit: 200 }));
        window.adminFeatures.allRewards = rows;

        if (!rows.length) {
            container.innerHTML = emptyState('🎁', 'Nessun premio riscattato');
            return;
        }
        renderRewardsTable(rows);
    } catch (err) {
        console.error('loadRewardsManagement:', err);
        showContainerError(container, err);
    }
};

window.renderRewardsTable = function (rewards) {
    const container = document.getElementById('rewards-management-container');
    if (!container) return;

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr><th>Premio</th><th>Ospite</th><th>Data</th><th>Codice</th><th>Stato</th><th>Azioni</th></tr>
            </thead>
            <tbody>
                ${rewards.map(r => {
                    const claimed = r.status === 'claimed';
                    const dateStr = r.redeemed_at || r.created_at || '';
                    return `
                        <tr>
                            <td>
                                <span style="font-size:24px;">${esc(r.reward_emoji || '🎁')}</span>
                                <strong>${esc(r.reward_name || 'Premio')}</strong>
                            </td>
                            <td>${esc(r.user_email || '-')}</td>
                            <td>${esc(dateStr ? formatDate(String(dateStr).split('T')[0]) : '-')}</td>
                            <td><code style="background:rgba(0,0,0,0.05); padding:4px 8px; border-radius:6px; font-weight:800;">${esc(r.code || 'N/D')}</code></td>
                            <td><span class="badge ${claimed ? 'completed' : 'pending'}">${claimed ? 'Consegnato' : 'Da consegnare'}</span></td>
                            <td>
                                ${claimed ? '✅' : `
                                    <button type="button" class="btn-icon view" data-action="mark-claimed" data-id="${esc(r.id)}" title="Segna come consegnato">
                                        <i data-lucide="check-circle" style="width:18px;height:18px;"></i>
                                    </button>`}
                            </td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    if (window.lucide) lucide.createIcons();
};

window.markRewardClaimed = async function (rewardId) {
    if (!confirm('Confermare la consegna del premio all\'ospite?')) return;
    try {
        await adminRpc('admin_mark_reward_claimed', { p_reward_id: parseInt(rewardId, 10) });
        alert('✅ Premio segnato come consegnato.');
        loadRewardsManagement();
        loadAnalytics();
    } catch (err) {
        console.error('markRewardClaimed:', err);
        alert('❌ ' + err.message);
    }
};

// ============================================
// 11. AVVISO CHECK-OUT DI OGGI
// ============================================
window.initExpiryAlerts = async function () {
    try {
        const rows = rowsOf(await adminRpc('admin_checkouts_today', {}));
        if (!rows.length) return;

        const box = document.createElement('div');
        box.style.cssText = 'position:fixed; top:20px; right:20px; background:rgba(255,160,0,0.95); backdrop-filter:blur(20px); color:white; padding:20px; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,0.3); z-index:9999; max-width:350px; font-weight:700; border:3px solid rgba(255,255,255,0.3);';
        box.innerHTML = `
            <div style="font-size:20px; margin-bottom:10px;">⚠️ Check-out oggi</div>
            <div style="font-size:14px; line-height:1.6;">
                ${rows.length} ${rows.length === 1 ? 'ospite parte' : 'ospiti partono'} oggi:<br>
                ${rows.map(s => `• Camera ${esc(s.room_number)} (${esc(s.last_name)})`).join('<br>')}
            </div>
            <button type="button" data-action="dismiss-parent"
                style="margin-top:15px; background:rgba(255,255,255,0.2); border:2px solid white; color:white; padding:8px 16px; border-radius:10px; cursor:pointer; font-weight:800; width:100%;">
                Ho capito
            </button>`;
        document.body.appendChild(box);
        setTimeout(() => box.remove(), 30000);
    } catch (err) {
        console.warn('initExpiryAlerts:', err.message);
    }
};

// ============================================
// 12. CAMERE OCCUPATE (total_rooms da hotel_settings)
// ============================================
window.addQuickStats = function () {
    const statsGrid = document.querySelector('#section-overview .stats-grid');
    if (!statsGrid || document.getElementById('quickStatsWidget')) return;

    statsGrid.insertAdjacentHTML('afterend', `
        <div id="quickStatsWidget" style="margin-top:20px;">
            <div class="data-section" style="background:rgba(255,255,255,0.92); backdrop-filter:blur(50px); border:3px solid rgba(255,255,255,0.6); border-radius:24px; padding:25px;">
                <div class="section-header" style="border-bottom:none; margin-bottom:15px; padding-bottom:0;">
                    <div class="section-title" style="font-size:18px;">🏨 Camere <small id="roomsTotalNote" style="font-size:12px; color:#999; font-weight:600;"></small></div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:15px; text-align:center;">
                    <div><div style="font-size:32px; font-weight:900; color:#00c853;" id="roomsOccupied">-</div><div style="font-size:12px; color:#999; font-weight:700;">Occupate</div></div>
                    <div><div style="font-size:32px; font-weight:900; color:#667eea;" id="roomsAvailable">-</div><div style="font-size:12px; color:#999; font-weight:700;">Libere</div></div>
                    <div><div style="font-size:32px; font-weight:900; color:#FF0080;" id="occupancyRate">-%</div><div style="font-size:12px; color:#999; font-weight:700;">Occupazione</div></div>
                </div>
            </div>
        </div>
    `);
    updateQuickStats();
};

window.updateQuickStats = async function () {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    try {
        if (!window.AdminOS.settings) await window.loadHotelSettings();
        const total = window.totalRooms();

        const stays = window.adminFeatures.allStays.length
            ? window.adminFeatures.allStays
            : rowsOf(await adminRpc('admin_list_stays', {}));

        const occupied = new Set(stays.map(u => String(u.room_number || '').trim()).filter(Boolean)).size;
        set('roomsOccupied', occupied);
        set('roomsAvailable', Math.max(total - occupied, 0));
        set('occupancyRate', Math.min(Math.round((occupied / total) * 100), 100) + '%');

        const note = document.getElementById('roomsTotalNote');
        if (note) {
            note.textContent = (window.AdminOS.settings && window.AdminOS.settings.total_rooms)
                ? `(${total} totali)`
                : `(${total} totali — imposta il valore reale in Impostazioni struttura)`;
        }
    } catch (err) {
        console.warn('updateQuickStats:', err.message);
        set('roomsOccupied', '-'); set('roomsAvailable', '-'); set('occupancyRate', '-');
    }
};

// ============================================
// 13. EXPORT CSV (lato client, nessuna libreria)
// ============================================
function csvCell(value) {
    if (value === null || value === undefined) return '';
    let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Protezione da "CSV injection" quando il file viene aperto in Excel
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function buildCsv(columns, rows) {
    const header = columns.map(c => csvCell(c.label)).join(';');
    const lines = rows.map(r => columns.map(c => csvCell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'));
    return '﻿' + [header, ...lines].join('\r\n');
}

function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const EXPORT_COLUMNS = {
    stays: [
        { label: 'ID', key: 'id' },
        { label: 'Camera', key: 'room_number' },
        { label: 'Cognome', key: 'last_name' },
        { label: 'Email', key: 'email' },
        { label: 'Check-in', key: 'stay_start_date' },
        { label: 'Check-out', key: 'stay_end_date' },
        { label: 'Attivo', get: r => (r.active ? 'SI' : 'NO') },
        { label: 'Registrato il', key: 'created_at' },
        { label: 'Ultimo accesso', key: 'last_login' },
        { label: 'Nota interna', get: r => r.staff_note || '' }
    ],
    bookings: [
        { label: 'Tipo', key: 'kind' }, { label: 'ID', key: 'id' },
        { label: 'Data', get: r => r.tour_date || r.booking_date },
        { label: 'Ora', key: 'booking_time' }, { label: 'Ospite', key: 'user_name' },
        { label: 'Email', key: 'user_email' }, { label: 'Camera', key: 'room_number' },
        { label: 'Dettaglio', get: r => r.tour_name || r.treatment_name || r.item_name || '' },
        { label: 'Persone', key: 'num_people' }, { label: 'Durata (min)', key: 'duration_minutes' },
        { label: 'Prezzo originale', key: 'original_price' }, { label: 'Prezzo finale', key: 'final_price' },
        { label: 'Punti usati', key: 'points_used' }, { label: 'Sconto', key: 'discount_amount' },
        { label: 'Stato', key: 'status' }, { label: 'Pagamento', key: 'payment_status' },
        { label: 'Creata il', key: 'created_at' }
    ],
    points: [
        { label: 'Email', key: 'user_email' }, { label: 'Nome', key: 'user_name' },
        { label: 'Punti', key: 'points' }, { label: 'Livello', key: 'level' },
        { label: 'Prenotazioni', key: 'total_bookings' },
        { label: 'Aggiornato il', key: 'updated_at' }
    ]
};

const EXPORT_FILENAMES = {
    stays: 'guestos_soggiorni',
    bookings: 'guestos_prenotazioni',
    points: 'guestos_punti'
};

/**
 * exportCSV(type): 'stays' | 'bookings' | 'points'
 * Genera un vero CSV (separatore ';', UTF-8 con BOM) che Excel, Numbers e
 * LibreOffice aprono direttamente. Nessuna libreria, nessun file .xlsx finto.
 */
window.exportCSV = async function (type = 'stays') {
    const columns = EXPORT_COLUMNS[type];
    if (!columns) { alert('Tipo di export non riconosciuto.'); return; }

    try {
        const rows = rowsOf(await adminRpc('admin_export_rows', { p_kind: type }));
        if (!rows.length) { alert('Nessun dato da esportare.'); return; }
        downloadTextFile(`${EXPORT_FILENAMES[type]}_${today()}.csv`, buildCsv(columns, rows));
    } catch (err) {
        console.error('exportCSV:', err);
        alert('❌ ' + err.message);
    }
};
// Nome storico usato da qualche bottone: e' sempre un CSV, non un .xlsx.
window.exportToExcel = window.exportCSV;

// ============================================
// 14. QR CODE LINK DI REGISTRAZIONE (qrcodejs 1.0.0 da cdnjs)
// ============================================
const QRCODE_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
let qrLibPromise = null;

function loadQrLibrary() {
    if (typeof window.QRCode === 'function') return Promise.resolve();
    if (qrLibPromise) return qrLibPromise;
    qrLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = QRCODE_LIB_URL;
        s.onload = () => resolve();
        s.onerror = () => { qrLibPromise = null; reject(new Error('Impossibile caricare la libreria QR.')); };
        document.head.appendChild(s);
    });
    return qrLibPromise;
}

function registrationUrl() {
    return window.location.origin + '/login.html';
}

window.generateQRCode = async function () {
    const url = registrationUrl();

    if (!document.getElementById('modalQRCode')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal-overlay" id="modalQRCode">
                <div class="modal-content" style="max-width:420px; text-align:center;">
                    <div class="modal-header" style="justify-content:center;"><span>📱 QR registrazione ospiti</span></div>
                    <div class="modal-body">
                        <div id="qrCodeBox" style="display:flex; justify-content:center; padding:10px; background:white; border-radius:16px;"></div>
                        <div id="qrCodeUrl" style="margin-top:14px; font-size:13px; font-weight:700; color:#666; word-break:break-all;"></div>
                        <div style="margin-top:8px; font-size:12px; color:#999;">Stampalo e mettilo in reception o in camera: l'ospite lo inquadra e si registra.</div>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn" type="button" data-action="close-modal">Chiudi</button>
                        <button class="modal-btn" type="button" data-action="copy-qr-url">📋 Copia link</button>
                        <button class="modal-btn primary" type="button" data-action="print-qr">🖨️ Stampa</button>
                    </div>
                </div>
            </div>
        `);
    }

    const box = document.getElementById('qrCodeBox');
    document.getElementById('qrCodeUrl').textContent = url;
    box.innerHTML = '<div class="loading">⏳ Generazione QR...</div>';
    document.getElementById('modalQRCode').classList.add('active');

    try {
        await loadQrLibrary();
        box.innerHTML = '';
        new QRCode(box, { text: url, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) {
        console.error(e);
        box.innerHTML = '<div class="loading" style="color:#d32f2f;">❌ Impossibile generare il QR.</div>';
    }
};

window.printQRCode = function () {
    const box = document.getElementById('qrCodeBox');
    if (!box) return;
    const img = box.querySelector('img');
    const canvas = box.querySelector('canvas');
    const dataUrl = (img && img.src) || (canvas && canvas.toDataURL('image/png'));
    if (!dataUrl) { alert('QR non ancora pronto.'); return; }

    const hotelName = (window.AdminOS.settings && window.AdminOS.settings.name) || 'GuestOS';
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) { alert('Consenti i popup per stampare il QR.'); return; }

    w.document.write(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>QR registrazione</title>
        <style>body{font-family:sans-serif;text-align:center;padding:40px;}h1{font-size:26px;margin-bottom:6px;}p{color:#555;}img{width:320px;height:320px;margin:20px 0;}.url{font-size:12px;color:#888;word-break:break-all;}</style>
        </head><body>
        <h1>${esc(hotelName)}</h1>
        <p>Inquadra il QR per registrarti all'app ospiti</p>
        <img src="${esc(dataUrl)}" alt="QR code">
        <div class="url">${esc(registrationUrl())}</div>
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
    w.document.close();
};

// ============================================
// 15. STORICO MODIFICHE (admin_audit_log)
// ============================================
const AUDIT_ACTION_LABELS = {
    'reset_pin': '🔑 Reset PIN',
    'admin_reset_pin': '🔑 Reset PIN',
    'extend_stay': '📅 Prolunga soggiorno',
    'checkout': '📤 Check-out',
    'admin_checkout': '📤 Check-out',
    'deactivate': '❌ Disattiva',
    'adjust_points': '⭐ Modifica punti',
    'admin_adjust_points': '⭐ Modifica punti',
    'update_settings': '⚙️ Impostazioni struttura',
    'booking_status': '📋 Stato prenotazione',
    'staff_note': '📝 Nota interna'
};

window.viewAuditLog = async function () {
    try {
        const rows = rowsOf(await adminRpc('admin_list_audit_log', { p_limit: 50 }));
        if (!rows.length) { alert('Nessuna attivita\' registrata.'); return; }

        const items = rows.map(log => {
            const when = new Date(log.created_at).toLocaleString('it-IT');
            const action = AUDIT_ACTION_LABELS[log.action] || log.action || '-';
            const raw = log.details ?? log.target_email ?? log.target_id ?? '';
            const details = typeof raw === 'object' ? JSON.stringify(raw) : String(raw || '');
            return `
                <div style="padding:12px; background:rgba(0,0,0,0.02); border-radius:10px; margin-bottom:8px;">
                    <strong>${esc(action)}</strong> da ${esc(log.admin_email || '-')}
                    ${details ? `<div style="font-size:12px; color:#666;">${esc(details)}</div>` : ''}
                    <small style="color:#999;">${esc(when)}</small>
                </div>`;
        }).join('');

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(10px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';
        modal.innerHTML = `
            <div style="background:white; border-radius:24px; padding:30px; max-width:600px; width:100%; max-height:80vh; overflow-y:auto;">
                <h2 style="margin-bottom:20px; font-size:24px; font-weight:900;">📋 Storico modifiche</h2>
                ${items}
                <button type="button" data-action="dismiss-audit"
                    style="margin-top:20px; width:100%; padding:14px; background:rgba(0,0,0,0.1); border:none; border-radius:14px; font-weight:800; cursor:pointer;">
                    Chiudi
                </button>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.dataset.action === 'dismiss-audit') modal.remove();
        });
    } catch (err) {
        console.error('viewAuditLog:', err);
        alert('❌ ' + err.message);
    }
};

// ============================================
// 16. DELEGA EVENTI (niente onclick con stringhe interpolate)
// ============================================
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = () => parseInt(el.dataset.id, 10);

    switch (el.dataset.action) {
        case 'view-stay': viewStay(id()); break;
        case 'reset-pin': resetPIN(id()); break;
        case 'deactivate-stay': deactivateStay(id()); break;
        case 'complete-checkout': completeCheckout(id()); break;
        case 'extend-stay': openExtendStayModal(id()); break;
        case 'staff-note': addStaffNote(id()); break;
        case 'adjust-points': adjustPoints(el.dataset.email, el.dataset.points); break;
        case 'mark-claimed': markRewardClaimed(el.dataset.id); break;
        case 'confirm-extend': confirmExtendStay(); break;
        case 'close-modal':
            if (typeof closeModal === 'function') closeModal();
            break;
        case 'close-one-time-pin':
            document.getElementById('modalOneTimePin')?.remove();
            break;
        case 'export-csv': exportCSV(el.dataset.export || 'stays'); break;
        case 'show-qr': generateQRCode(); break;
        case 'print-qr': printQRCode(); break;
        case 'copy-qr-url':
            navigator.clipboard?.writeText(registrationUrl())
                .then(() => alert('Link copiato: ' + registrationUrl()))
                .catch(() => prompt('Copia il link:', registrationUrl()));
            break;
        case 'audit-log': viewAuditLog(); break;
        case 'dismiss-parent': el.parentElement?.remove(); break;
        default: break;
    }
});

document.addEventListener('change', (e) => {
    const el = e.target.closest('select[data-action="change-status"]');
    if (!el) return;
    changeBookingStatus(el.dataset.type, el.dataset.id, el.value, el);
});

// ============================================
// INIT: parte solo dopo che la dashboard ha verificato l'admin
// (evento 'guestos-admin-ready' emesso dallo script inline della dashboard)
// ============================================
async function initAdminFeatures() {
    initGlobalSearch();
    initExtendStayModal();
    await window.loadHotelSettings();

    const hotelNameEl = document.getElementById('hotelName');
    if (hotelNameEl && window.AdminOS.settings?.name) {
        hotelNameEl.textContent = window.AdminOS.settings.name;
    }

    addQuickStats();
    loadOverviewStats();
    loadAnalytics();
    loadActiveStays();
    initExpiryAlerts();
}

if (window.AdminOS.ready) {
    initAdminFeatures();
} else {
    document.addEventListener('guestos-admin-ready', initAdminFeatures, { once: true });
}
