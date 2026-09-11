// guest-session.js
// Sessione ospite GuestOS: token in localStorage + wrapper verso le RPC Supabase
// (SECURITY DEFINER). Va incluso DOPO config.js:
//   <script src="config.js"></script><script src="guest-session.js"></script>
//
// Espone window.GuestOS = { token, isLoggedIn, requireLogin, rpc, awardPoints,
// getPoints, escapeHtml, logout, saveSession, clearSession, user }
// e window.escapeHtml.
//
// Funziona anche senza supabaseClient (es. theme-selection.html): in quel caso
// isLoggedIn()/requireLogin() usano solo localStorage e rpc() rifiuta.

(function () {
    'use strict';

    var SESSION_KEYS = [
        'guestos_token',
        'guestos_user_email',
        'guestos_user_name',
        'guestos_room_number',
        'guestos_user_id',
        'guestos_stay_start_date',
        'guestos_stay_end_date',
        'guestos_logged_in',
        'guestos_username',
        'guestos_user_pin' // legacy: viene sempre rimossa
    ];

    // Il server può emettere il token di sessione come UUID oppure come stringa
    // esadecimale (es. 64 char da gen_random_bytes). Accettiamo entrambi i formati
    // per non vincolare l'implementazione lato database.
    var TOKEN_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,128})$/i;

    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function safeSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* storage non disponibile */ }
    }
    function safeRemove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* noop */ }
    }

    // Il PIN non deve mai restare sul dispositivo.
    safeRemove('guestos_user_pin');

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function token() {
        var t = safeGet('guestos_token');
        return t && TOKEN_RE.test(t) ? t : null;
    }

    function isLoggedIn() {
        if (!token()) return false;
        if (safeGet('guestos_logged_in') !== 'true') return false;
        var end = safeGet('guestos_stay_end_date');
        if (end) {
            var today = new Date().toISOString().slice(0, 10);
            if (end < today) return false;
        }
        return true;
    }

    function requireLogin(redirectTo) {
        if (isLoggedIn()) return true;
        clearSession();
        var target = redirectTo || 'login.html';
        if (!/login\.html/.test(window.location.pathname)) {
            window.location.href = target;
        }
        return false;
    }

    function user() {
        return {
            id: safeGet('guestos_user_id'),
            email: safeGet('guestos_user_email'),
            last_name: safeGet('guestos_user_name'),
            room_number: safeGet('guestos_room_number'),
            username: safeGet('guestos_username'),
            stay_start_date: safeGet('guestos_stay_start_date'),
            stay_end_date: safeGet('guestos_stay_end_date')
        };
    }

    // Salva la sessione restituita da guest_register / guest_login.
    function saveSession(payload) {
        if (!payload || !payload.token || !payload.user) return false;
        var u = payload.user;
        safeSet('guestos_token', payload.token);
        safeSet('guestos_user_id', String(u.id));
        safeSet('guestos_user_email', u.email || '');
        safeSet('guestos_user_name', u.last_name || '');
        safeSet('guestos_room_number', u.room_number || '');
        safeSet('guestos_stay_start_date', u.stay_start_date || '');
        safeSet('guestos_stay_end_date', u.stay_end_date || '');
        if (u.username) safeSet('guestos_username', u.username); else safeRemove('guestos_username');
        safeSet('guestos_logged_in', 'true');
        safeRemove('guestos_user_pin');
        return true;
    }

    function clearSession() {
        SESSION_KEYS.forEach(safeRemove);
    }

    function client() {
        if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient) return window.supabaseClient;
        if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; // eslint-disable-line no-undef
        return null;
    }

    // Traduzione codici errore server -> messaggio utente (italiano).
    var ERROR_MESSAGES = {
        SESSION_INVALID: 'Sessione scaduta. Accedi di nuovo.',
        STAY_ENDED: 'Il tuo soggiorno è terminato.',
        ROOM_OCCUPIED: 'Camera già occupata! Usa "Accedi con PIN" per entrare nel tuo account.',
        INVALID_CREDENTIALS: 'Credenziali non corrette.',
        TOO_MANY_ATTEMPTS: 'Troppi tentativi. Riprova tra 10 minuti o contatta la reception.',
        INVALID_INPUT: 'Dati non validi.',
        INVALID_EMAIL: 'Email non valida.',
        EMAIL_IN_USE: 'Email già usata da un altro ospite attivo.',
        USERNAME_TAKEN: 'Username già in uso! Scegline un altro.',
        INSUFFICIENT_POINTS: 'Punti insufficienti.',
        OUT_OF_STOCK: 'Premio esaurito.',
        REWARD_NOT_FOUND: 'Premio non disponibile.',
        BOOKING_NOT_FOUND: 'Prenotazione non trovata.',
        INVALID_DATE: 'Data non valida.',
        ALREADY_COMPLETED: 'Hai già completato questa sfida!',
        RATE_LIMITED: 'Hai raggiunto il limite giornaliero. Riprova domani.',
        NOT_FOUND: 'Non disponibile.',
        NOT_AUTHORIZED: 'Non hai i permessi per questa operazione.',
        OFFER_EXPIRED: 'Questa offerta è scaduta.',
        OFFER_NOT_STARTED: 'Questa offerta non è ancora attiva.',
        OFFER_SOLD_OUT: 'Posti esauriti per questa offerta.',
        OFFER_NOT_BOOKABLE: 'Questa offerta si conferma in reception.'
    };

    function RpcError(code, message, original) {
        this.name = 'RpcError';
        this.code = code;
        this.message = message;
        this.original = original;
    }
    RpcError.prototype = Object.create(Error.prototype);

    function normalizeError(err) {
        var raw = (err && (err.message || err.msg)) || String(err || 'Errore');
        // Le RPC sollevano eccezioni con messaggio "CODICE: dettaglio" oppure solo "CODICE".
        var m = /^([A-Z_]{4,40})(?::\s*(.*))?$/.exec(raw.trim());
        var code = m ? m[1] : 'RPC_ERROR';
        var message = ERROR_MESSAGES[code] || (m && m[2]) || raw;
        if (code === 'SESSION_INVALID' || code === 'STAY_ENDED') {
            clearSession();
        }
        return new RpcError(code, message, err);
    }

    // Chiama una RPC. Se params non contiene p_token e l'utente è loggato, lo aggiunge.
    async function rpc(name, params) {
        var sb = client();
        if (!sb) throw new RpcError('NO_CLIENT', 'Connessione al server non disponibile.');
        params = params || {};
        if (!('p_token' in params)) {
            var t = token();
            if (t) params = Object.assign({ p_token: t }, params);
        }
        var res = await sb.rpc(name, params);
        if (res.error) throw normalizeError(res.error);
        return res.data;
    }

    // --- Toast "+N punti" -------------------------------------------------
    var toastStyleInjected = false;
    function showPointsToast(points) {
        try {
            if (!toastStyleInjected) {
                var style = document.createElement('style');
                style.textContent =
                    '.guestos-points-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(20px);' +
                    'background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-family:Poppins,system-ui,sans-serif;' +
                    'font-weight:800;font-size:16px;padding:12px 22px;border-radius:999px;box-shadow:0 10px 30px rgba(99,102,241,.45);' +
                    'z-index:99999;opacity:0;transition:opacity .25s ease,transform .25s ease;pointer-events:none;white-space:nowrap}' +
                    '.guestos-points-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}';
                document.head.appendChild(style);
                toastStyleInjected = true;
            }
            var el = document.createElement('div');
            el.className = 'guestos-points-toast';
            el.textContent = '+' + points + ' punti';
            document.body.appendChild(el);
            requestAnimationFrame(function () { el.classList.add('show'); });
            setTimeout(function () {
                el.classList.remove('show');
                setTimeout(function () { el.remove(); }, 300);
            }, 2200);
        } catch (e) { /* UI opzionale */ }
    }

    // awardPoints(gameId, score) -> {points_awarded, total} | null
    // Il server calcola i punti dal punteggio (tetti: 50/partita, 300/giorno, 20 partite/giorno).
    async function awardPoints(gameId, score) {
        if (!isLoggedIn()) return null;
        try {
            var data = await rpc('award_points', {
                p_game_id: String(gameId || '').toLowerCase(),
                p_score: Math.max(0, Math.floor(Number(score) || 0))
            });
            if (data && data.points_awarded > 0) {
                showPointsToast(data.points_awarded);
            }
            return data || null;
        } catch (err) {
            console.warn('awardPoints:', err.code || '', err.message);
            return null;
        }
    }

    async function getPoints() {
        if (!isLoggedIn()) return 0;
        try {
            var me = await rpc('guest_me', {});
            return (me && me.points && Number(me.points.points)) || 0;
        } catch (err) {
            console.warn('getPoints:', err.message);
            return 0;
        }
    }

    async function logout(redirectTo) {
        try {
            if (token() && client()) await rpc('guest_logout', {});
        } catch (e) { /* il token locale viene comunque eliminato */ }
        clearSession();
        window.location.href = redirectTo || 'login.html';
    }

    var existing = window.GuestOS || {};
    window.GuestOS = Object.assign(existing, {
        token: token,
        isLoggedIn: isLoggedIn,
        requireLogin: requireLogin,
        rpc: rpc,
        awardPoints: awardPoints,
        getPoints: getPoints,
        escapeHtml: escapeHtml,
        logout: logout,
        saveSession: saveSession,
        clearSession: clearSession,
        user: user,
        RpcError: RpcError,
        errorMessage: function (err) { return (err && err.message) || 'Errore imprevisto.'; }
    });
    window.escapeHtml = escapeHtml;
})();
