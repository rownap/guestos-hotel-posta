// points-helper.js
// Helper centralizzato per gestire i punti utente.
// Usa UPDATE (non upsert/insert) perché:
//   - Le RLS Supabase bloccano INSERT/UPSERT dalla anon key (errore 42501).
//   - Il trigger PostgreSQL `user_points_auto_create` (vedi db-setup.sql)
//     garantisce che ogni utente abbia il record già al momento della
//     registrazione. Quindi UPDATE è sempre sufficiente.
// USO: await addPoints(20)  // restituisce il nuovo totale, o null se errore.

(function () {
    function getEmail() {
        return localStorage.getItem('guestos_user_email') || null;
    }

    /**
     * Aggiunge (o sottrae se negativo) punti all'utente loggato.
     * @param {number} delta - punti da aggiungere/sottrarre
     * @returns {Promise<number|null>} nuovo totale punti, o null se errore
     */
    window.addPoints = async function (delta) {
        const email = getEmail();
        if (!email) {
            console.warn('addPoints: utente non loggato, skip');
            return null;
        }
        if (typeof supabaseClient === 'undefined') {
            console.warn('addPoints: supabaseClient non disponibile');
            return null;
        }
        try {
            const { data: current, error: selErr } = await supabaseClient
                .from('user_points')
                .select('points')
                .eq('user_email', email)
                .maybeSingle();

            if (selErr) {
                console.error('addPoints select error:', selErr);
                return null;
            }
            if (!current) {
                console.warn('addPoints: nessun record per', email,
                    '— verificare che il trigger db sia attivo (db-setup.sql).');
                return null;
            }

            const newPts = Math.max(0, (current.points || 0) + delta);

            const { error: updErr } = await supabaseClient
                .from('user_points')
                .update({
                    points: newPts,
                    updated_at: new Date().toISOString()
                })
                .eq('user_email', email);

            if (updErr) {
                console.error('addPoints update error:', updErr);
                return null;
            }
            console.log(`✅ Punti: ${current.points || 0} → ${newPts} (${delta > 0 ? '+' : ''}${delta})`);
            return newPts;
        } catch (err) {
            console.error('addPoints error:', err);
            return null;
        }
    };

    /**
     * Restituisce i punti correnti dell'utente loggato.
     * @returns {Promise<number>}
     */
    window.getPoints = async function () {
        const email = getEmail();
        if (!email || typeof supabaseClient === 'undefined') return 0;
        try {
            const { data } = await supabaseClient
                .from('user_points')
                .select('points')
                .eq('user_email', email)
                .maybeSingle();
            return data?.points || 0;
        } catch (err) {
            console.error('getPoints error:', err);
            return 0;
        }
    };

    /**
     * Imposta direttamente il totale punti.
     * @param {number} newTotal
     */
    window.setPoints = async function (newTotal) {
        const email = getEmail();
        if (!email || typeof supabaseClient === 'undefined') return null;
        try {
            const { error } = await supabaseClient
                .from('user_points')
                .update({
                    points: Math.max(0, newTotal),
                    updated_at: new Date().toISOString()
                })
                .eq('user_email', email);
            if (error) {
                console.error('setPoints error:', error);
                return null;
            }
            return Math.max(0, newTotal);
        } catch (err) {
            console.error('setPoints error:', err);
            return null;
        }
    };
})();
