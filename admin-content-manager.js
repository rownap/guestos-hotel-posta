/**
 * GUESTOS ADMIN - CONTENT MANAGEMENT SYSTEM
 * Gestisce Ristorante, Tours, SPA, Animazione, Last Minute
 */

// Configurazione Tabelle
const TABLES = {
    RESTAURANT: 'restaurant_menu',
    TOURS: 'tours',
    SPA: 'spa_services',
    ANIMATION: 'animation_activities',
    LAST_MINUTE: 'last_minute_offers', // Tabella esistente
    REWARDS: 'rewards' // Gestione Premi
};

// Stato Corrente
let currentEditingItem = null;
let currentSection = null;

// ==========================================
// 🚀 APERTURA MODALI E GESTIONE UI
// ==========================================

function openContentManager(section) {
    currentSection = section;
    const modalTitle = document.getElementById('contentModalTitle');
    const modalBody = document.getElementById('contentModalBody');
    const modal = document.getElementById('contentModal');

    // Reset
    modalBody.innerHTML = '<div class="loading">Caricamento dati...</div>';
    modal.classList.add('active');

    // Routing Sezione
    switch (section) {
        case 'restaurant':
            modalTitle.textContent = '🍽️ Gestione Menu Ristorante';
            loadRestaurantItems();
            break;
        case 'tours':
            modalTitle.textContent = '🚌 Gestione Escursioni';
            loadToursItems();
            break;
        case 'spa':
            modalTitle.textContent = '💆 Gestione Servizi SPA';
            loadSpaItems();
            break;
        case 'animation':
            modalTitle.textContent = '🎉 Gestione Animazione';
            loadAnimationItems();
            break;
        case 'last_minute':
            modalTitle.textContent = '🔥 Gestione Offerte Last Minute';
            loadLastMinuteItems();
            break;
        case 'rewards':
            modalTitle.textContent = '🎁 Gestione Premi';
            loadRewardsItems();
            break;
    }
}

function closeContentModal() {
    document.getElementById('contentModal').classList.remove('active');
    currentSection = null;
    currentEditingItem = null;
}

// ------------------------------------------
// 🍽️ RISTORANTE
// ------------------------------------------
async function loadRestaurantItems() {
    try {
        const { data, error } = await supabaseClient.from(TABLES.RESTAURANT).select('*').order('category');
        if (error) throw error;
        renderGenericTable(data, 'restaurant', ['Categoria', 'Piatto', 'Prezzo'], (item) => `
            <td><span class="badge ${getCategoryBadgeColor(item.category)}">${item.category}</span></td>
            <td><div style="font-weight:700;">${item.name}</div><div style="font-size:12px;color:#999;">${item.description || ''}</div></td>
            <td>€${item.price}</td>
        `);
    } catch (err) { handleError(err, 'restaurant_menu'); }
}

// ------------------------------------------
// 🚌 TOURS
// ------------------------------------------
async function loadToursItems() {
    try {
        const { data, error } = await supabaseClient.from(TABLES.TOURS).select('*').order('id', { ascending: false });
        if (error) throw error;
        renderGenericTable(data, 'tours', ['Categoria', 'Tour', 'Dettagli', 'Prezzo'], (item) => `
            <td><span class="badge active">${item.category || 'N/A'}</span></td>
            <td><div style="font-weight:700;">${item.title || item.name || 'Senza Titolo'}</div>${item.featured ? '<span style="color:#FF0080;font-weight:900;font-size:10px;">🔥 FEATURED</span>' : ''}</td>
            <td style="font-size:12px;">⏱️ ${item.duration}<br>👥 Max ${item.max_people || '-'}</td>
            <td>€${item.price}</td>
        `);
    } catch (err) { handleError(err, 'tours'); }
}

// ------------------------------------------
// 💆 SPA
// ------------------------------------------
async function loadSpaItems() {
    try {
        const { data, error } = await supabaseClient.from(TABLES.SPA).select('*').order('name');
        if (error) throw error;
        renderGenericTable(data, 'spa', ['Servizio', 'Durata', 'Prezzo'], (item) => `
            <td><div style="font-weight:700;">${item.name}</div><div style="font-size:12px;color:#999;">${item.description || ''}</div></td>
            <td>⏱️ ${item.duration}</td>
            <td>€${item.price}</td>
        `);
    } catch (err) { handleError(err, 'spa_services'); }
}

// ------------------------------------------
// 🎉 ANIMAZIONE
// ------------------------------------------
async function loadAnimationItems() {
    try {
        const { data, error } = await supabaseClient.from(TABLES.ANIMATION).select('*').order('start_time');
        if (error) throw error;
        renderGenericTable(data, 'animation', ['Orario', 'Attività', 'Luogo'], (item) => `
            <td><div style="font-weight:900; font-size:16px;">${item.start_time}</div></td>
            <td><div style="font-weight:700;">${item.title}</div><div style="font-size:12px;color:#999;">${item.description || ''}</div></td>
            <td>📍 ${item.location}</td>
        `);
    } catch (err) { handleError(err, 'animation_activities'); }
}

// ------------------------------------------
// 🎁 REWARDS (Premi)
// ------------------------------------------
async function loadRewardsItems() {
    try {
        const { data, error } = await supabaseClient.from(TABLES.REWARDS).select('*').order('points_required');
        if (error) throw error;
        renderGenericTable(data, 'rewards', ['Premio', 'Punti', 'Stock', 'Stato'], (item) => `
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="font-size:32px;">${item.emoji || '🎁'}</div>
                    <div>
                        <div style="font-weight:700;">${item.name}</div>
                        <div style="font-size:12px;color:#999;">${item.description || ''}</div>
                    </div>
                </div>
            </td>
            <td><span style="font-weight:900; color:#fbbf24; font-size:18px;">${item.points_required}</span> punti</td>
            <td>${item.stock === -1 ? '<span class="badge active">♾️ Illimitato</span>' : `<span class="badge ${item.stock > 0 ? 'confirmed' : 'expired'}">${item.stock} disponibili</span>`}</td>
            <td><span class="badge ${item.active ? 'active' : 'expired'}">${item.active ? 'Attivo' : 'Disattivo'}</span></td>
        `);
    } catch (err) { handleError(err, 'rewards'); }
}

// ------------------------------------------
// 🔥 LAST MINUTE (Tabella Esistente)
// ------------------------------------------
async function loadLastMinuteItems() {
    try {
        const { data, error } = await supabaseClient.from(TABLES.LAST_MINUTE).select('*').order('id', { ascending: false });
        if (error) throw error;

        renderGenericTable(data, 'last_minute', ['Tipo', 'Offerta', 'Prezzo', 'Sconto'], (item) => `
            <td><span class="badge">${item.type}</span></td>
            <td><div style="font-weight:700;">${item.title}</div><div style="font-size:12px;color:#999;">${item.description || ''}</div></td>
            <td>
                <div style="text-decoration:line-through; color:#999;">€${item.original_price || 0}</div>
                <div style="font-weight:900; color:#00c853; font-size:16px;">€${item.discounted_price}</div>
            </td>
            <td><span class="badge confirmed">-${item.discount_percent || 0}%</span></td>
        `);
    } catch (err) { handleError(err, 'last_minute_offers'); }
}

// ==========================================
// 🎨 RENDER GENERICO
// ==========================================
function renderGenericTable(items, type, headers, rowFn) {
    const container = document.getElementById('contentModalBody');
    let html = `
        <div class="top-actions" style="margin-bottom: 20px;">
            <button class="action-btn" onclick="openEditModal('${type}')">➕ Aggiungi Nuovo</button>
        </div>
        <div class="data-table-container">
            <table class="data-table">
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}<th>Azioni</th></tr></thead>
                <tbody>
    `;

    if (!items || items.length === 0) {
        html += `<tr><td colspan="${headers.length + 1}" class="text-center p-4">Nessun elemento presente</td></tr>`;
    } else {
        items.forEach(item => {
            html += `<tr>${rowFn(item)}<td>
                <div class="action-buttons">
                    <button class="btn-icon edit" onclick='editItem("${type}", ${JSON.stringify(item)})'>✏️</button>
                    <button class="btn-icon delete" onclick="deleteItem('${TABLES[type.toUpperCase()]}', '${item.id}', '${type}')">🗑️</button>
                </div>
            </td></tr>`;
        });
    }
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ==========================================
// 🛠️ EDIT & SAVE
// ==========================================

function openEditModal(type, item = null) {
    const container = document.getElementById('contentModalBody');
    currentEditingItem = item;

    let fields = '';

    if (type === 'restaurant') {
        fields = `
            ${renderInput('Nome Piatto', 'name', item?.name, true)}
            ${renderTextarea('Descrizione', 'description', item?.description)}
            ${renderSelect('Categoria', 'category', ['antipasti', 'primi', 'secondi', 'dolci', 'vini'], item?.category)}
            ${renderInput('Prezzo (€)', 'price', item?.price, true, 'number')}
        `;
    }
    else if (type === 'tours') {
        fields = `
            ${renderInput('Titolo Tour', 'title', item?.title || item?.name, true)}
            ${renderTextarea('Descrizione', 'description', item?.description)}
            ${renderSelect('Categoria', 'category', ['mare', 'montagna', 'cultura', 'enogastronomia'], (item?.category || '').toLowerCase())}
            <div class="grid grid-cols-2 gap-4" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                ${renderInput('Prezzo (€)', 'price', item?.price, true, 'number')}
                ${renderInput('Durata', 'duration', item?.duration)}
            </div>
            ${renderInput('Max Persone', 'max_people', item?.max_people, false, 'number')}
            <div class="form-group mb-3"><label><input type="checkbox" name="featured" ${item?.featured ? 'checked' : ''}> Featured</label></div>
        `;
    }
    else if (type === 'spa') {
        fields = `
            ${renderInput('Nome Servizio', 'name', item?.name, true)}
            ${renderTextarea('Descrizione', 'description', item?.description)}
            ${renderInput('Durata', 'duration', item?.duration)}
            ${renderInput('Prezzo (€)', 'price', item?.price, true, 'number')}
        `;
    }
    else if (type === 'animation') {
        fields = `
            ${renderInput('Titolo Attività', 'title', item?.title, true)}
            ${renderTextarea('Descrizione', 'description', item?.description)}
            <div class="grid grid-cols-2 gap-4" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                ${renderInput('Orario Inizio', 'start_time', item?.start_time, true, 'time')}
                ${renderInput('Luogo', 'location', item?.location)}
            </div>
            ${renderSelect('Categoria', 'category', ['sport', 'kids', 'show', 'relax'], item?.category)}
        `;
    }
    else if (type === 'rewards') {
        fields = `
            ${renderInput('Nome Premio', 'name', item?.name, true)}
            ${renderTextarea('Descrizione', 'description', item?.description)}
            ${renderInput('Emoji', 'emoji', item?.emoji || '🎁')}
            <div class="grid grid-cols-2 gap-4" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                ${renderInput('Punti Richiesti', 'points_required', item?.points_required, true, 'number')}
                ${renderInput('Stock (-1 = illimitato)', 'stock', item?.stock ?? -1, true, 'number')}
            </div>
            <div class="form-group mb-3"><label><input type="checkbox" name="active" ${item?.active !== false ? 'checked' : ''}> Attivo</label></div>
        `;
    }
    else if (type === 'last_minute') {
        // Mappatura specifica per tabella esistente last_minute_offers
        fields = `
            ${renderInput('Titolo Offerta', 'title', item?.title, true)}
            ${renderTextarea('Dettagli Offerta', 'description', item?.description)}
            ${renderSelect('Applica a', 'type', ['tours', 'ristorante', 'spa'], item?.type)}
            <div class="grid grid-cols-2 gap-4" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                ${renderInput('Prezzo Originale (€)', 'original_price', item?.original_price, true, 'number')}
                ${renderInput('Prezzo Scontato (€)', 'discounted_price', item?.discounted_price, true, 'number')}
            </div>
            ${renderInput('Sconto % (Auto-Calcolato se vuoto)', 'discount_percent', item?.discount_percent, false, 'number')}
            ${renderInput('Slot Disponibili', 'slots_available', item?.slots_available || 10, true, 'number')}
        `;
    }

    container.innerHTML = `
        <div class="form-container" style="max-width: 500px; margin: 0 auto;">
            <h3 style="margin-bottom: 20px;">${item ? '✏️ Modifica' : '➕ Nuovo'}</h3>
            <form onsubmit="saveItem(event, '${type}')">
                ${fields}
                <div class="modal-actions mt-4" style="margin-top:20px; display:flex; gap:10px;">
                    <button type="button" class="modal-btn" onclick="openContentManager('${type}')">Annulla</button>
                    <button type="submit" class="modal-btn primary" style="flex:1;">💾 Salva</button>
                </div>
            </form>
        </div>
    `;
}

function editItem(type, item) { openEditModal(type, item); }

async function saveItem(event, type) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    if (type === 'tours') {
        data.featured = event.target.querySelector('[name="featured"]').checked;
    }

    if (type === 'rewards') {
        data.active = event.target.querySelector('[name="active"]').checked;
        data.points_required = parseInt(data.points_required);
        data.stock = parseInt(data.stock);
    }

    // Logica specifica per Last Minute esistente
    if (type === 'last_minute') {
        // Calcolo automatico sconto se non inserito
        if (!data.discount_percent && data.original_price && data.discounted_price) {
            data.discount_percent = Math.round((1 - data.discounted_price / data.original_price) * 100);
        }
        // Campi obbligatori tabella esistente
        data.active = true;
        // Conversione numerica
        data.slots_available = parseInt(data.slots_available);
        data.discount_percent = parseInt(data.discount_percent);
    }

    const table = TABLES[type.toUpperCase()];

    try {
        const { error } = currentEditingItem
            ? await supabaseClient.from(table).update(data).eq('id', currentEditingItem.id)
            : await supabaseClient.from(table).insert([data]);

        if (error) throw error;
        alert('Salvato! 💾');
        openContentManager(type);
    } catch (err) {
        console.error(err);
        alert('Errore: ' + err.message);
    }
}

async function deleteItem(table, id, type) {
    if (!confirm('Eliminare elemento?')) return;
    try {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) throw error;
        openContentManager(type);
    } catch (err) { alert('Errore: ' + err.message); }
}

// Helpers Form
function renderInput(label, name, val, req = false, type = 'text') {
    return `<div class="form-group mb-3" style="margin-bottom:15px;"><label style="display:block;font-weight:700;margin-bottom:5px;">${label}</label><input type="${type}" name="${name}" class="form-input" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;" value="${val || ''}" ${req ? 'required' : ''}></div>`;
}
function renderTextarea(label, name, val) {
    return `<div class="form-group mb-3" style="margin-bottom:15px;"><label style="display:block;font-weight:700;margin-bottom:5px;">${label}</label><textarea name="${name}" class="form-input" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;" rows="3">${val || ''}</textarea></div>`;
}
function renderSelect(label, name, options, val) {
    return `<div class="form-group mb-3" style="margin-bottom:15px;"><label style="display:block;font-weight:700;margin-bottom:5px;">${label}</label><select name="${name}" class="form-input" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;">${options.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o.toUpperCase()}</option>`).join('')}</select></div>`;
}

function handleError(err, table) {
    console.error(err);
    document.getElementById('contentModalBody').innerHTML = `<div class="empty-state"><div class="empty-title" style="color:#d32f2f;">Errore</div><div class="empty-text">Impossibile caricare dati.<br>Tabella: <b>${table}</b> mancante o errore connessione.</div></div>`;
}

function getCategoryBadgeColor(cat) { return 'active'; }
