// points-helper.js
// Helper centralizzato per gestire i punti utente. Usa UPSERT per evitare
// il bug "punti persi" che si verificava con UPDATE su record inesistenti.
// USO: await addPoints(20); — semplice e sicuro.

(function () {
    function getEmail() {
        return localStorage.getItem('guestos_user_email') || null;
    }

    function getName() {
        return localStorage.getItem('guestos_user_name') || 'Ospite';
    }

    /**
     * Aggiunge (o sottrae se negativo) punti all'utente loggato.
     * Crea automaticamente il record user_points se non esiste.
     * @param {number} delta - punti da aggiungere (può essere negativo)
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
            const { data: current } = await supabaseClient
                .from('user_points')
                .select('points, badges, total_bookings')
                .eq('user_email', email)
                .maybeSingle();

            const currentPts = current?.points || 0;
            const newPts = Math.max(0, currentPts + delta);

            const { error } = await supabaseClient
                .from('user_points')
                .upsert({
                    user_email: email,
                    user_name: getName(),
                    points: newPts,
                    badges: current?.badges || [],
                    total_bookings: current?.total_bookings || 0,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_email' });

            if (error) {
                console.error('addPoints upsert error:', error);
                return null;
            }
            console.log(`✅ Punti: ${currentPts} → ${newPts} (${delta > 0 ? '+' : ''}${delta})`);
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
     * Imposta direttamente il totale punti (usato dopo prenotazioni che scalano punti).
     * @param {number} newTotal
     */
    window.setPoints = async function (newTotal) {
        const email = getEmail();
        if (!email || typeof supabaseClient === 'undefined') return null;
        try {
            const { error } = await supabaseClient
                .from('user_points')
                .upsert({
                    user_email: email,
                    user_name: getName(),
                    points: Math.max(0, newTotal),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_email' });
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
