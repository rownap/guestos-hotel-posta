/**
 * GUESTOS FLASH DEALS - Admin Logic
 * Gestisce il lancio delle offerte lampo e il monitoraggio
 */

// Esponi le funzioni globalmente per essere chiamate dagli onclick dell'HTML
window.launchFlashDeal = launchFlashDeal;
window.loadFlashDeals = loadFlashDeals;
window.openFlashDealModal = openFlashDealModal;
window.submitFlashDeal = submitFlashDeal;
window.updateOfferPreview = updateOfferPreview;

const OFFER_TEMPLATES = {
    'spa': "✨ Ritrova il tuo benessere! Sconto esclusivo del {n}% su tutti i trattamenti Spa. Prenota ora!",
    'restaurant': "🍽️ Gusta i sapori della nostra cucina! Sconto speciale del {n}% per la cena di stasera.",
    'tour': "🚢 Esplora le meraviglie locali! {n}% di sconto sulle nostre escursioni più belle.",
    'bar': "🍹 Aperitivo con vista? Goditelo con uno sconto del {n}% al nostro Bar!",
    'default': "⚡ Offerta Lampo imperdibile! Approfitta dello sconto del {n}% valido solo per poco tempo."
};

function updateOfferPreview() {
    const service = document.getElementById('fd-service').value;
    const discount = document.getElementById('fd-discount').value || '20';

    // Choose template based on service
    const template = OFFER_TEMPLATES[service] || OFFER_TEMPLATES['default'];

    // Replace placeholder
    const headline = template.replace('{n}', discount);

    // Update textarea
    const textarea = document.getElementById('fd-headline');
    if (textarea) {
        textarea.value = headline;
    }
}

async function launchFlashDeal(serviceType, discountPct, durationMin, headline) {
    try {
        const expiresAt = new Date(Date.now() + durationMin * 60000).toISOString();

        const { data, error } = await supabaseClient
            .from('flash_deals')
            .insert([
                {
                    service_type: serviceType,
                    discount_pct: parseInt(discountPct),
                    expires_at: expiresAt,
                    status: 'active',
                    headline: headline
                }
            ]);

        if (error) throw error;

        console.log('🚀 Flash Deal lanciato con successo:', data);
        return { success: true, data };
    } catch (err) {
        console.error('❌ Errore nel lancio della Flash Deal:', err);
        let errorMsg = err.message;
        if (errorMsg.includes('relation "flash_deals" does not exist')) {
            errorMsg = "Tabella 'flash_deals' non trovata. Assicurati di aver eseguito lo script SQL fornito.";
        }
        return { success: false, error: errorMsg };
    }
}

async function loadFlashDeals() {
    console.log('📡 Fetching flash deals...');
    const container = document.getElementById('yield-management-container');
    if (!container) {
        console.warn('⚠️ Container yield-management-container non trovato');
        return;
    }

    try {
        if (typeof supabaseClient === 'undefined') {
            throw new Error('Supabase client non inizializzato (variabile supabaseClient mancante)');
        }

        const { data, error } = await supabaseClient
            .from('flash_deals')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-state">✅ Nessuna offerta lanciata. Usa il pulsante in alto per iniziare!</div>';
            return;
        }

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Servizio</th>
                        <th>Note</th>
                        <th>Sconto</th>
                        <th>Scadenza</th>
                        <th>Stato</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(deal => {
            const statusClass = deal.status === 'active' ? 'active' : 'expired';
            const note = deal.headline ? `<small style="display:block; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${deal.headline}">${deal.headline}</small>` : '-';

            html += `
                <tr>
                    <td><strong>${deal.service_type.toUpperCase()}</strong></td>
                    <td>${note}</td>
                    <td style="color: #FF0080; font-weight: 900;">-${deal.discount_pct}%</td>
                    <td>${new Date(deal.expires_at).toLocaleTimeString()}</td>
                    <td><span class="badge ${statusClass}">${deal.status}</span></td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
        console.log('✅ Flash deals caricate:', data.length);
    } catch (err) {
        console.error('❌ Error loading flash deals:', err);
        const msg = err.message || 'Errore tecnico';
        container.innerHTML = `<div class="loading" style="color:#d32f2f;">❌ Errore: ${msg}</div>`;
    }
}

function openFlashDealModal() {
    console.log('🔓 Tentativo apertura modale...');
    const modal = document.getElementById('modalFlashDeal');
    if (modal) {
        modal.classList.add('active');
        // Trigger initial template population
        updateOfferPreview();
        loadHeadlineHistory();
        console.log('✅ Modale aperta');
    } else {
        console.error('❌ Elemento modalFlashDeal non trovato nel DOM');
        alert('Errore: Modale non trovata.');
    }
}

async function submitFlashDeal() {
    const service = document.getElementById('fd-service').value;
    const discount = document.getElementById('fd-discount').value;
    const duration = document.getElementById('fd-duration').value;
    const headline = document.getElementById('fd-headline').value;

    console.log('🚀 Invio Flash Deal:', { service, discount, duration, headline });

    if (!discount || discount < 1) {
        alert('Inserisci uno sconto valido');
        return;
    }

    try {
        const result = await launchFlashDeal(service, discount, duration, headline);
        if (result.success) {
            alert('🚀 Offerta lanciata con successo!');
            // Chiudi tutte le modali
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
            loadFlashDeals();
        } else {
            alert('❌ Errore DB: ' + result.error);
        }
    } catch (err) {
        console.error('❌ Errore critico:', err);
        alert('❌ Errore critico: ' + err.message);
    }
}

/**
 * Controlla e aggiorna lo stato delle offerte scadute
 */
async function cleanupExpiredDeals() {
    try {
        const now = new Date().toISOString();
        if (typeof supabaseClient !== 'undefined') {
            const { error } = await supabaseClient
                .from('flash_deals')
                .update({ status: 'expired' })
                .eq('status', 'active')
                .lt('expires_at', now);
            if (error) throw error;
        }
    } catch (err) {
        console.error('❌ Errore cleanup flash deals:', err);
    }
}

// Esegui cleanup ogni minuto se siamo nella dashboard admin
if (window.location.pathname.includes('dashboard')) {
    setInterval(cleanupExpiredDeals, 60000);
}
