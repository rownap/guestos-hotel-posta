/**
 * GUESTOS FLASH DEALS — logica admin delle offerte lampo.
 *
 * Sicurezza:
 *  - `flash_deals` ha due policy: `public_read` (chiunque vede le offerte) e
 *    `admin_all` (lettura e scrittura complete quando guestos_is_admin() e' vero,
 *    cioe' quando la richiesta porta un x-admin-token valido). La console quindi
 *    legge e scrive la tabella in diretta: non servono RPC dedicate, ed e' il
 *    database a rifiutare chi non e' amministratore.
 *  - Ogni valore che finisce in innerHTML passa da escapeHtml(): le intestazioni
 *    delle offerte sono testo scritto a mano dallo staff.
 */
(function () {
    'use strict';

    const esc = (window.AdminOS && window.AdminOS.escapeHtml) || function (s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    // Il client Supabase porta gia' l'header x-admin-token (vedi config.js):
    // e' quello che fa passare la policy admin_all.
    function db() {
        if (!window.AdminOS || !window.AdminOS.token()) {
            throw new Error('Sessione admin non disponibile.');
        }
        const sb = window.supabaseClient;
        if (!sb) throw new Error('Connessione al database non disponibile.');
        return sb.from('flash_deals');
    }

    // I valori sono ESATTAMENTE quelli delle <option> di #fd-service nel modale.
    const SERVICES = ['spa', 'restaurant', 'tour', 'bar'];

    // Alias storici usati dai template: 'tours' nel DB e nei testi e' 'tour'.
    const SERVICE_ALIASES = {
        tours: 'tour',
        escursioni: 'tour',
        ristorante: 'restaurant',
        room: 'spa',        // il late check-out non ha un servizio proprio
        camera: 'spa'
    };

    function normalizeService(value) {
        const v = String(value || '').trim().toLowerCase();
        if (SERVICES.includes(v)) return v;
        return SERVICE_ALIASES[v] || 'spa';
    }
    window.normalizeFlashDealService = normalizeService;

    const OFFER_TEMPLATES = {
        spa: '✨ Ritrova il tuo benessere! Sconto esclusivo del {n}% su tutti i trattamenti Spa. Prenota ora!',
        restaurant: '🍽️ Gusta i sapori della nostra cucina! Sconto speciale del {n}% per la cena di stasera.',
        tour: '🚢 Esplora le meraviglie locali! {n}% di sconto sulle nostre escursioni piu\' belle.',
        bar: '🍹 Aperitivo con vista? Goditelo con uno sconto del {n}% al nostro Bar!',
        default: '⚡ Offerta Lampo imperdibile! Approfitta dello sconto del {n}% valido solo per poco tempo.'
    };

    const SERVICE_LABELS = {
        spa: '💆 Spa & Relax',
        restaurant: '🍽️ Ristorante',
        tour: '🚢 Escursioni',
        bar: '🍹 Bar & Aperitivi'
    };

    const HISTORY_KEY = 'guestos_fd_headlines';
    const HISTORY_MAX = 8;

    function el(id) { return document.getElementById(id); }

    function readHistory() {
        try {
            const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            return Array.isArray(raw) ? raw.filter(x => typeof x === 'string' && x.trim()) : [];
        } catch (e) { return []; }
    }

    function pushHistory(headline) {
        const text = String(headline || '').trim();
        if (!text) return;
        const list = readHistory().filter(h => h !== text);
        list.unshift(text);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX))); }
        catch (e) { /* storage non disponibile: si perde solo lo storico locale */ }
    }

    // ------------------------------------------------------------------
    // Anteprima e template delle intestazioni
    // ------------------------------------------------------------------
    function updateOfferPreview() {
        const service = normalizeService(el('fd-service') && el('fd-service').value);
        const discount = (el('fd-discount') && el('fd-discount').value) || '20';
        const textarea = el('fd-headline');
        if (!textarea) return;
        // Non sovrascrive un testo che l'operatore ha modificato a mano.
        if (textarea.dataset.touched === '1') return;
        textarea.value = (OFFER_TEMPLATES[service] || OFFER_TEMPLATES.default).replace('{n}', discount);
    }

    function loadHeadlineHistory() {
        const tplGroup = el('fd-optgroup-templates');
        const histGroup = el('fd-optgroup-history');
        const discount = (el('fd-discount') && el('fd-discount').value) || '20';

        if (tplGroup) {
            tplGroup.innerHTML = SERVICES.map(s =>
                `<option value="${esc(OFFER_TEMPLATES[s].replace('{n}', discount))}">${esc(SERVICE_LABELS[s])}</option>`
            ).join('');
        }
        if (histGroup) {
            const list = readHistory();
            histGroup.innerHTML = list.length
                ? list.map(h => `<option value="${esc(h)}">${esc(h.length > 60 ? h.slice(0, 57) + '…' : h)}</option>`).join('')
                : '<option value="" disabled>Nessuna offerta recente</option>';
        }
        const select = el('fd-headline-history');
        if (select) select.value = '';
    }

    function applyHeadlineTemplate(value) {
        const textarea = el('fd-headline');
        if (!textarea || !value) return;
        textarea.value = value;
        textarea.dataset.touched = '1';
    }

    // ------------------------------------------------------------------
    // Elenco offerte
    // ------------------------------------------------------------------
    async function loadFlashDeals() {
        const container = el('yield-management-container');
        if (!container) return;

        container.innerHTML = '<div class="loading">⏳ Caricamento offerte...</div>';
        try {
            const { data, error } = await db()
                .select('id, service_type, discount_pct, headline, status, expires_at, created_at')
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            const rows = Array.isArray(data) ? data : (data ? [data] : []);

            if (!rows.length) {
                container.innerHTML = '<div class="empty-state">'
                    + '<div class="empty-icon">⚡</div>'
                    + '<div class="empty-title">Nessuna offerta lanciata</div>'
                    + '<div class="empty-text">Usa il pulsante in alto per lanciare la prima.</div>'
                    + '</div>';
                return;
            }

            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr><th>Servizio</th><th>Intestazione</th><th>Sconto</th><th>Scadenza</th><th>Stato</th></tr>
                    </thead>
                    <tbody>
                        ${rows.map(renderDealRow).join('')}
                    </tbody>
                </table>`;
        } catch (err) {
            console.error('loadFlashDeals:', err);
            container.innerHTML = '<div class="loading" style="color:#d32f2f;">❌ '
                + esc((err && err.message) || 'Errore caricamento offerte') + '</div>';
        }
    }

    function renderDealRow(deal) {
        const service = normalizeService(deal.service_type);
        const active = deal.status === 'active';
        const headline = String(deal.headline || '').trim();
        const expires = deal.expires_at ? new Date(deal.expires_at) : null;
        const when = expires && !isNaN(expires.getTime())
            ? expires.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '-';

        return `
            <tr>
                <td><strong>${esc(SERVICE_LABELS[service] || service)}</strong></td>
                <td>${headline
                    ? `<small style="display:block; max-width:260px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(headline)}">${esc(headline)}</small>`
                    : '-'}</td>
                <td style="color:#FF0080; font-weight:900;">-${parseInt(deal.discount_pct, 10) || 0}%</td>
                <td>${esc(when)}</td>
                <td><span class="badge ${active ? 'active' : 'expired'}">${active ? 'Attiva' : 'Scaduta'}</span></td>
            </tr>`;
    }

    // ------------------------------------------------------------------
    // Lancio offerta
    // ------------------------------------------------------------------
    function openFlashDealModal() {
        const modal = el('modalFlashDeal');
        if (!modal) {
            console.error('modalFlashDeal non presente nel DOM');
            return;
        }
        const textarea = el('fd-headline');
        if (textarea) delete textarea.dataset.touched;
        modal.classList.add('active');
        updateOfferPreview();
        loadHeadlineHistory();
    }

    async function submitFlashDeal() {
        const service = normalizeService(el('fd-service') && el('fd-service').value);
        const discount = parseInt((el('fd-discount') && el('fd-discount').value) || '', 10);
        const duration = parseInt((el('fd-duration') && el('fd-duration').value) || '', 10);
        const headline = String((el('fd-headline') && el('fd-headline').value) || '').trim();

        if (!discount || discount < 5 || discount > 90) {
            alert('Lo sconto deve essere tra 5 e 90 per cento.');
            return;
        }
        if (!duration || duration < 5) {
            alert('Scegli una durata valida.');
            return;
        }
        if (!headline) {
            alert('Scrivi l\'intestazione che vedra\' l\'ospite.');
            return;
        }

        try {
            const expiresAt = new Date(Date.now() + duration * 60000).toISOString();
            const { error } = await db().insert({
                service_type: service,
                discount_pct: discount,
                headline: headline,
                expires_at: expiresAt,
                status: 'active'
            });
            if (error) throw error;
            pushHistory(headline);
            alert('✅ Offerta lanciata.');
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
            loadFlashDeals();
        } catch (err) {
            console.error('submitFlashDeal:', err);
            alert('❌ ' + ((err && err.message) || 'Errore nel lancio dell\'offerta.'));
        }
    }

    // Segna come scadute le offerte oltre il termine. L'UPDATE passa dalla policy
    // admin_all, quindi lo puo' fare solo una console con token valido.
    async function cleanupExpiredDeals() {
        if (!window.AdminOS || !window.AdminOS.token()) return;
        try {
            const { error } = await db()
                .update({ status: 'expired' })
                .eq('status', 'active')
                .lt('expires_at', new Date().toISOString());
            if (error) throw error;
        } catch (err) {
            // Silenzioso: e' manutenzione di sfondo, non un'azione dell'operatore.
            console.warn('cleanupExpiredDeals:', err && err.message);
        }
    }

    // ------------------------------------------------------------------
    // Esposizione + eventi
    // ------------------------------------------------------------------
    window.loadFlashDeals = loadFlashDeals;
    window.openFlashDealModal = openFlashDealModal;
    window.submitFlashDeal = submitFlashDeal;
    window.updateOfferPreview = updateOfferPreview;
    window.loadHeadlineHistory = loadHeadlineHistory;
    window.applyHeadlineTemplate = applyHeadlineTemplate;

    document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'fd-headline') e.target.dataset.touched = '1';
    });

    if (/dashboard/.test(window.location.pathname)) {
        setInterval(cleanupExpiredDeals, 60000);
    }
})();
