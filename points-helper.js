// points-helper.js
// Wrapper sottile su window.GuestOS (guest-session.js).
//
// Il browser NON può più leggere né scrivere la tabella user_points: con le RLS
// attive in produzione ogni accesso diretto è codice morto. I punti si toccano
// solo attraverso le RPC SECURITY DEFINER:
//   - award_points(p_game_id, p_score)  -> assegnazione, con i tetti del server
//   - guest_me()                        -> saldo corrente
//
// Va incluso DOPO config.js e guest-session.js:
//   <script src="config.js"></script>
//   <script src="guest-session.js"></script>
//   <script src="points-helper.js"></script>
//
// setPoints è stato RIMOSSO di proposito: impostare un saldo arbitrario è
// un'operazione da amministratore (admin_adjust_points), non da browser.

(function () {
    'use strict';

    function guestos() {
        return window.GuestOS || null;
    }

    /**
     * Assegna i punti di una partita. È il SERVER a decidere quanti punti valgono:
     * il punteggio passato è solo il risultato del gioco.
     * @param {string} gameId identificativo del gioco (es. 'quiz')
     * @param {number} score punteggio ottenuto
     * @returns {Promise<{points_awarded:number,total:number}|null>}
     */
    window.addPoints = async function (gameId, score) {
        var g = guestos();
        if (!g) {
            console.warn('addPoints: guest-session.js non caricato');
            return null;
        }
        return await g.awardPoints(gameId, score);
    };

    /**
     * Restituisce i punti correnti dell'ospite loggato (via guest_me).
     * @returns {Promise<number>}
     */
    window.getPoints = async function () {
        var g = guestos();
        if (!g) return 0;
        return await g.getPoints();
    };
})();
