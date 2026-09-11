// booking-notify.js
// Invio della email di conferma prenotazione. Va incluso DOPO guest-session.js:
//   <script src="guest-session.js"></script><script src="booking-notify.js"></script>
//
// Espone window.GuestOS.notifyBooking(payload) -> Promise<{sent:boolean, reason?:string}>
//
// Non lancia MAI eccezioni verso il chiamante: se l'invio fallisce (chiave email
// non configurata, rete assente, funzione non deployata) la prenotazione resta
// comunque valida, perché è già stata registrata sul database.
//
// Uso tipico, dopo un create_booking andato a buon fine:
//   window.GuestOS?.notifyBooking?.({
//       kind: 'spa',                 // 'restaurant' | 'spa' | 'tour' | 'last_minute' | 'room_service'
//       booking_id: res.id,
//       email: GuestOS.user().email,
//       name: GuestOS.user().last_name,
//       item_name: 'Massaggio Relax 50 min',
//       date: '2026-09-12',
//       time: '16:30',
//       people: 2,
//       final_price: 45,
//       room: GuestOS.user().room_number
//   });

(function () {
    'use strict';

    var ENDPOINT = '/api/send-confirmation';
    var TIMEOUT_MS = 8000;

    var VALID_KINDS = ['restaurant', 'spa', 'tour', 'last_minute', 'room_service'];

    function clean(value, max) {
        if (value === null || value === undefined) return '';
        return String(value).trim().slice(0, max || 200);
    }

    function toNumber(value) {
        var n = Number(value);
        return isFinite(n) ? n : null;
    }

    /**
     * Invia la richiesta di email di conferma.
     * @param {Object} payload
     * @returns {Promise<{sent:boolean, reason?:string}>} risolve sempre, non rigetta mai.
     */
    async function notifyBooking(payload) {
        payload = payload || {};

        var kind = clean(payload.kind, 20).toLowerCase();
        if (VALID_KINDS.indexOf(kind) === -1) {
            console.warn('notifyBooking: kind non valido:', kind);
            return { sent: false, reason: 'invalid_kind' };
        }

        var email = clean(payload.email, 160);
        if (!email || email.indexOf('@') === -1) {
            // Senza indirizzo non c'è nulla da inviare: non è un errore.
            return { sent: false, reason: 'no_email' };
        }

        var body = {
            kind: kind,
            booking_id: clean(payload.booking_id, 40),
            email: email,
            name: clean(payload.name, 80),
            item_name: clean(payload.item_name, 120),
            date: clean(payload.date, 20),
            time: clean(payload.time, 10),
            people: toNumber(payload.people),
            final_price: toNumber(payload.final_price),
            room: clean(payload.room, 20)
        };

        var controller = null;
        var timer = null;
        try {
            if (typeof AbortController !== 'undefined') {
                controller = new AbortController();
                timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
            }

            var res = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined
            });

            if (timer) clearTimeout(timer);

            var data = {};
            try { data = await res.json(); } catch (e) { data = {}; }

            if (!res.ok) {
                console.warn('notifyBooking: risposta', res.status, data && data.reason);
                return { sent: false, reason: (data && data.reason) || ('http_' + res.status) };
            }
            return { sent: data.sent === true, reason: data.reason };
        } catch (err) {
            if (timer) clearTimeout(timer);
            var reason = err && err.name === 'AbortError' ? 'timeout' : 'network_error';
            console.warn('notifyBooking:', reason, err && err.message ? err.message : '');
            return { sent: false, reason: reason };
        }
    }

    window.GuestOS = window.GuestOS || {};
    window.GuestOS.notifyBooking = notifyBooking;
})();
