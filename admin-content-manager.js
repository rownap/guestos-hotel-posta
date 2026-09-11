/**
 * GUESTOS ADMIN — GESTIONE CONTENUTI
 * Menu ristorante, escursioni, servizi spa, animazione, offerte last minute, premi.
 *
 * Sicurezza:
 *  - Ogni tabella di catalogo ha due policy: `public_read` (l'ospite vede solo le
 *    righe attive) e `admin_all`, che da' lettura e scrittura complete quando
 *    guestos_is_admin() e' vero, cioe' quando la richiesta porta un x-admin-token
 *    valido. La console quindi legge e scrive in diretta: e' il database a
 *    rifiutare chi non e' amministratore, non il browser a doversi autolimitare.
 *  - Tutto cio' che finisce in innerHTML passa da escapeHtml(): i nomi dei piatti,
 *    dei tour e dei premi sono testo scritto a mano dallo staff.
 *  - Niente onclick con stringhe interpolate (prima l'elenco iniettava un intero
 *    JSON.stringify dell'oggetto dentro un attributo HTML): data-attribute +
 *    addEventListener, con gli oggetti tenuti in memoria e non nel markup.
 */
(function () {
    'use strict';

    const esc = (window.AdminOS && window.AdminOS.escapeHtml) || function (s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    // Tabella e ordinamento per ogni sezione della console.
    // spa punta a spa_treatments (id interi): e' il catalogo prenotabile, quello
    // a cui si riferisce spa_bookings.treatment_id. La vecchia spa_services e'
    // stata rinominata spa_services_legacy e non e' piu' raggiungibile.
    const TABLES = {
        restaurant: { table: 'restaurant_menu', order: 'category' },
        tours: { table: 'tours', order: 'name' },
        spa: { table: 'spa_treatments', order: 'price' },
        animation: { table: 'animation_activities', order: 'start_time' },
        last_minute: { table: 'last_minute_offers', order: 'valid_until' },
        rewards: { table: 'rewards', order: 'points_required' }
    };

    // Il client Supabase porta gia' l'header x-admin-token (vedi config.js):
    // e' quello che fa passare la policy admin_all.
    function db(kind) {
        if (!window.AdminOS || !window.AdminOS.token()) {
            throw new Error('Sessione admin non disponibile.');
        }
        const sb = window.supabaseClient;
        if (!sb) throw new Error('Connessione al database non disponibile.');
        const cfg = TABLES[kind];
        if (!cfg) throw new Error('Sezione contenuti sconosciuta.');
        return { q: sb.from(cfg.table), order: cfg.order };
    }

    const KINDS = {
        restaurant: { title: '🍽️ Gestione menu ristorante', empty: 'Nessun piatto in menu' },
        tours: { title: '🚌 Gestione escursioni', empty: 'Nessuna escursione' },
        spa: { title: '💆 Gestione servizi spa', empty: 'Nessun servizio spa' },
        animation: { title: '🎉 Gestione animazione', empty: 'Nessuna attivita\'' },
        last_minute: { title: '🔥 Gestione offerte last minute', empty: 'Nessuna offerta' },
        rewards: { title: '🎁 Gestione premi', empty: 'Nessun premio' }
    };

    let currentKind = null;
    let currentItems = [];        // righe caricate, indicizzate per id
    let currentEditingItem = null;

    function body() { return document.getElementById('contentModalBody'); }

    function setBody(html) {
        const el = body();
        if (el) el.innerHTML = html;
    }

    function money(v) {
        const n = Number(v);
        return '€' + (isFinite(n) ? n : 0).toFixed(2);
    }

    // ==========================================
    // APERTURA / CHIUSURA
    // ==========================================
    async function openContentManager(kind) {
        const cfg = KINDS[kind];
        if (!cfg) { console.warn('Sezione contenuti sconosciuta:', kind); return; }

        currentKind = kind;
        currentEditingItem = null;

        const titleEl = document.getElementById('contentModalTitle');
        const modal = document.getElementById('contentModal');
        if (titleEl) titleEl.textContent = cfg.title;
        if (modal) modal.classList.add('active');
        setBody('<div class="loading">⏳ Caricamento dati...</div>');

        try {
            const { q, order } = db(kind);
            const { data, error } = await q.select('*').order(order, { ascending: true });
            if (error) throw error;
            currentItems = Array.isArray(data) ? data : (data ? [data] : []);
            renderList(kind, currentItems);
        } catch (err) {
            console.error('openContentManager ' + kind + ':', err);
            setBody('<div class="empty-state">'
                + '<div class="empty-title" style="color:#d32f2f;">Errore</div>'
                + '<div class="empty-text">' + esc((err && err.message) || 'Impossibile caricare i dati.') + '</div>'
                + '</div>');
        }
    }

    function closeContentModal() {
        const modal = document.getElementById('contentModal');
        if (modal) modal.classList.remove('active');
        currentKind = null;
        currentEditingItem = null;
        currentItems = [];
    }

    // ==========================================
    // ELENCO
    // ==========================================
    const COLUMNS = {
        restaurant: {
            headers: ['Categoria', 'Piatto', 'Prezzo'],
            row: item => `
                <td><span class="badge active">${esc(item.category || '-')}</span></td>
                <td><div style="font-weight:700;">${esc(item.name)}</div>
                    <div style="font-size:12px;color:#999;">${esc(item.description || '')}</div></td>
                <td>${esc(money(item.price))}</td>`
        },
        tours: {
            headers: ['Categoria', 'Tour', 'Dettagli', 'Prezzo'],
            row: item => `
                <td><span class="badge active">${esc(item.category || '-')}</span></td>
                <td><div style="font-weight:700;">${esc(item.title || item.name || 'Senza titolo')}</div>
                    ${item.featured ? '<span style="color:#FF0080;font-weight:900;font-size:10px;">🔥 IN EVIDENZA</span>' : ''}</td>
                <td style="font-size:12px;">⏱️ ${esc(item.duration || '-')}<br>👥 Max ${esc(item.max_people || '-')}</td>
                <td>${esc(money(item.price))}</td>`
        },
        spa: {
            headers: ['Trattamento', 'Durata', 'Prezzo'],
            row: item => `
                <td><div style="font-weight:700;">${esc(item.emoji || '💆')} ${esc(item.name)}</div>
                    <div style="font-size:12px;color:#999;">${esc(item.description || '')}</div></td>
                <td>⏱️ ${esc(item.duration_minutes || '-')} min</td>
                <td>${esc(money(item.price))}</td>`
        },
        animation: {
            headers: ['Orario', 'Attivita\'', 'Luogo'],
            row: item => `
                <td><div style="font-weight:900; font-size:16px;">${esc(item.start_time || '-')}</div></td>
                <td><div style="font-weight:700;">${esc(item.title)}</div>
                    <div style="font-size:12px;color:#999;">${esc(item.description || '')}</div></td>
                <td>📍 ${esc(item.location || '-')}</td>`
        },
        last_minute: {
            headers: ['Tipo', 'Offerta', 'Prezzo', 'Sconto'],
            row: item => `
                <td><span class="badge active">${esc(item.type || '-')}</span></td>
                <td><div style="font-weight:700;">${esc(item.title)}</div>
                    <div style="font-size:12px;color:#999;">${esc(item.description || '')}</div></td>
                <td><div style="text-decoration:line-through; color:#999;">${esc(money(item.original_price))}</div>
                    <div style="font-weight:900; color:#00c853; font-size:16px;">${esc(money(item.discounted_price))}</div></td>
                <td><span class="badge confirmed">-${parseInt(item.discount_percent, 10) || 0}%</span></td>`
        },
        rewards: {
            headers: ['Premio', 'Punti', 'Scorte', 'Stato'],
            row: item => `
                <td><div style="display:flex; align-items:center; gap:10px;">
                        <div style="font-size:32px;">${esc(item.emoji || '🎁')}</div>
                        <div><div style="font-weight:700;">${esc(item.name)}</div>
                             <div style="font-size:12px;color:#999;">${esc(item.description || '')}</div></div>
                    </div></td>
                <td><span style="font-weight:900; color:#fbbf24; font-size:18px;">${parseInt(item.points_required, 10) || 0}</span> punti</td>
                <td>${Number(item.stock) === -1
                    ? '<span class="badge active">♾️ Illimitato</span>'
                    : `<span class="badge ${Number(item.stock) > 0 ? 'confirmed' : 'expired'}">${parseInt(item.stock, 10) || 0} disponibili</span>`}</td>
                <td><span class="badge ${item.active ? 'active' : 'expired'}">${item.active ? 'Attivo' : 'Disattivo'}</span></td>`
        }
    };

    function renderList(kind, items) {
        const cfg = COLUMNS[kind];
        const headers = cfg.headers;

        const rows = (items && items.length)
            ? items.map(item => `<tr>${cfg.row(item)}<td>
                    <div class="action-buttons">
                        <button type="button" class="btn-icon edit" data-content-action="edit"
                                data-id="${esc(item.id)}" title="Modifica">✏️</button>
                        <button type="button" class="btn-icon delete" data-content-action="delete"
                                data-id="${esc(item.id)}" title="Elimina">🗑️</button>
                    </div></td></tr>`).join('')
            : `<tr><td colspan="${headers.length + 1}" style="text-align:center; padding:24px; color:#999; font-weight:700;">${esc(KINDS[kind].empty)}</td></tr>`;

        setBody(`
            <div class="top-actions" style="margin-bottom:20px;">
                <button type="button" class="action-btn" data-content-action="new">➕ Aggiungi nuovo</button>
            </div>
            <div class="data-table-container">
                <table class="data-table">
                    <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}<th>Azioni</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`);
    }

    // ==========================================
    // FORM
    // ==========================================
    function input(label, name, val, req, type) {
        return `<div class="form-group" style="margin-bottom:15px;">
            <label style="display:block;font-weight:700;margin-bottom:5px;">${esc(label)}</label>
            <input type="${esc(type || 'text')}" name="${esc(name)}" class="form-input"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;"
                   value="${esc(val === null || val === undefined ? '' : val)}" ${req ? 'required' : ''}>
        </div>`;
    }

    function textarea(label, name, val) {
        return `<div class="form-group" style="margin-bottom:15px;">
            <label style="display:block;font-weight:700;margin-bottom:5px;">${esc(label)}</label>
            <textarea name="${esc(name)}" class="form-input" rows="3"
                      style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;">${esc(val || '')}</textarea>
        </div>`;
    }

    function select(label, name, options, val) {
        return `<div class="form-group" style="margin-bottom:15px;">
            <label style="display:block;font-weight:700;margin-bottom:5px;">${esc(label)}</label>
            <select name="${esc(name)}" class="form-input"
                    style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;">
                ${options.map(o => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(String(o).toUpperCase())}</option>`).join('')}
            </select>
        </div>`;
    }

    function checkbox(label, name, checked) {
        return `<div class="form-group" style="margin-bottom:15px;">
            <label><input type="checkbox" name="${esc(name)}" ${checked ? 'checked' : ''}> ${esc(label)}</label>
        </div>`;
    }

    const FORMS = {
        restaurant: i => input('Nome piatto', 'name', i && i.name, true)
            + textarea('Descrizione', 'description', i && i.description)
            + select('Categoria', 'category', ['antipasti', 'primi', 'secondi', 'dolci', 'vini'], i && i.category)
            + input('Prezzo (€)', 'price', i && i.price, true, 'number'),
        tours: i => input('Titolo tour', 'title', i && (i.title || i.name), true)
            + textarea('Descrizione', 'description', i && i.description)
            + select('Categoria', 'category', ['mare', 'montagna', 'cultura', 'enogastronomia'], (i && String(i.category || '').toLowerCase()))
            + input('Prezzo (€)', 'price', i && i.price, true, 'number')
            + input('Durata', 'duration', i && i.duration)
            + input('Max persone', 'max_people', i && i.max_people, false, 'number')
            + checkbox('In evidenza', 'featured', i && i.featured),
        spa: i => input('Nome trattamento', 'name', i && i.name, true)
            + textarea('Descrizione', 'description', i && i.description)
            + input('Emoji', 'emoji', (i && i.emoji) || '💆')
            + select('Categoria', 'category', ['massaggi', 'viso', 'corpo', 'percorsi'], i && i.category)
            + input('Durata (minuti)', 'duration_minutes', i && i.duration_minutes, true, 'number')
            + input('Prezzo (€)', 'price', i && i.price, true, 'number')
            + checkbox('Attivo', 'active', !i || i.active !== false),
        animation: i => input('Titolo attivita\'', 'title', i && i.title, true)
            + textarea('Descrizione', 'description', i && i.description)
            + input('Orario inizio', 'start_time', i && i.start_time, true, 'time')
            + input('Luogo', 'location', i && i.location)
            + select('Categoria', 'category', ['sport', 'kids', 'show', 'relax'], i && i.category),
        last_minute: i => input('Titolo offerta', 'title', i && i.title, true)
            + textarea('Dettagli offerta', 'description', i && i.description)
            + select('Applica a', 'type', ['tour', 'ristorante', 'spa'], i && i.type)
            + input('Prezzo originale (€)', 'original_price', i && i.original_price, true, 'number')
            + input('Prezzo scontato (€)', 'discounted_price', i && i.discounted_price, true, 'number')
            + input('Sconto % (calcolato se vuoto)', 'discount_percent', i && i.discount_percent, false, 'number')
            + input('Posti disponibili', 'slots_available', (i && i.slots_available) || 10, true, 'number'),
        rewards: i => input('Nome premio', 'name', i && i.name, true)
            + textarea('Descrizione', 'description', i && i.description)
            + input('Emoji', 'emoji', (i && i.emoji) || '🎁')
            + input('Punti richiesti', 'points_required', i && i.points_required, true, 'number')
            + input('Scorte (-1 = illimitate)', 'stock', (i && i.stock !== undefined && i.stock !== null) ? i.stock : -1, true, 'number')
            + checkbox('Attivo', 'active', !i || i.active !== false)
    };

    function openEditForm(kind, item) {
        currentEditingItem = item || null;
        setBody(`
            <div style="max-width:520px; margin:0 auto;">
                <h3 style="margin-bottom:20px;">${item ? '✏️ Modifica' : '➕ Nuovo'}</h3>
                <form id="contentForm">
                    ${FORMS[kind](item)}
                    <div style="margin-top:20px; display:flex; gap:10px;">
                        <button type="button" class="modal-btn" data-content-action="cancel">Annulla</button>
                        <button type="submit" class="modal-btn primary" style="flex:1;">💾 Salva</button>
                    </div>
                </form>
            </div>`);
        const form = document.getElementById('contentForm');
        if (form) form.addEventListener('submit', onSubmit);
    }

    const NUMERIC = ['price', 'points_required', 'stock', 'max_people', 'duration_minutes',
        'original_price', 'discounted_price', 'discount_percent', 'slots_available'];

    async function onSubmit(event) {
        event.preventDefault();
        const kind = currentKind;
        const form = event.target;
        const payload = {};

        new FormData(form).forEach((value, key) => { payload[key] = value; });

        // I checkbox assenti dal FormData valgono false.
        form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            payload[cb.name] = cb.checked;
        });

        NUMERIC.forEach(key => {
            if (payload[key] === undefined || payload[key] === '') { delete payload[key]; return; }
            const n = Number(payload[key]);
            payload[key] = isFinite(n) ? n : null;
        });

        // La tabella tours porta sia `name` sia `title` e il vincolo NOT NULL sta
        // su name: il form ne chiede uno solo, quindi li allineiamo entrambi.
        if (kind === 'tours' && payload.title) {
            payload.name = payload.title;
        }

        if (kind === 'last_minute') {
            if (payload.discount_percent === undefined
                && payload.original_price > 0 && payload.discounted_price !== undefined) {
                payload.discount_percent = Math.round((1 - payload.discounted_price / payload.original_price) * 100);
            }
            payload.active = true;
        }

        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvataggio...'; }

        try {
            const { q } = db(kind);
            const { error } = currentEditingItem
                ? await q.update(payload).eq('id', currentEditingItem.id)
                : await q.insert(payload);
            if (error) throw error;
            await openContentManager(kind);
        } catch (err) {
            console.error('salvataggio contenuto ' + kind + ':', err);
            alert('❌ ' + ((err && err.message) || 'Errore durante il salvataggio.'));
            if (btn) { btn.disabled = false; btn.textContent = '💾 Salva'; }
        }
    }

    async function deleteItem(kind, id) {
        if (!confirm('Eliminare questo elemento?\nL\'operazione non si annulla.')) return;
        try {
            const { q } = db(kind);
            const { error } = await q.delete().eq('id', id);
            if (error) throw error;
            await openContentManager(kind);
        } catch (err) {
            console.error('eliminazione contenuto ' + kind + ':', err);
            alert('❌ ' + ((err && err.message) || 'Errore durante l\'eliminazione.'));
        }
    }

    // ==========================================
    // DELEGA EVENTI
    // ==========================================
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-content-action]');
        if (!el || !currentKind) return;

        const id = el.dataset.id;
        const item = currentItems.find(x => String(x.id) === String(id)) || null;

        switch (el.dataset.contentAction) {
            case 'new': openEditForm(currentKind, null); break;
            case 'edit': if (item) openEditForm(currentKind, item); break;
            case 'delete': deleteItem(currentKind, id); break;
            case 'cancel': openContentManager(currentKind); break;
            default: break;
        }
    });

    window.openContentManager = openContentManager;
    window.closeContentModal = closeContentModal;
})();
