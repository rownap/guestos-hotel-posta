/**
 * GUESTOS ADMIN - COMPLETE FEATURES MODULE
 * Include questo file nel dashboard per attivare tutte le funzionalità
 * <script src="guestos-admin-features.js"></script>
 */

// ============================================
// GLOBAL STATE
// ============================================
window.adminFeatures = {
    allBookings: {
        restaurant: [],
        tours: [],
        spa: []
    },
    allPoints: [],
    allRewards: []
};

// ============================================
// 1. RICERCA GLOBALE
// ============================================
window.initGlobalSearch = function() {
    // Add search bar to top-bar if not exists
    const topBar = document.querySelector('.top-bar');
    if (!topBar || document.getElementById('globalSearchBar')) return;
    
    const searchHTML = `
        <div id="globalSearchBar" style="display: flex; gap: 8px; align-items: center; flex: 1; max-width: 400px; margin-left: 20px;">
            <input 
                type="text" 
                id="globalSearch" 
                placeholder="🔍 Cerca ospite (camera, nome, email)..."
                style="flex: 1; padding: 12px 16px; border: 2px solid rgba(0,0,0,0.08); border-radius: 14px; font-weight: 600; font-size: 14px;"
                onkeypress="if(event.key==='Enter') handleGlobalSearch()"
            >
            <button 
                onclick="handleGlobalSearch()" 
                style="padding: 12px 20px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 14px; font-weight: 800; cursor: pointer;">
                Cerca
            </button>
        </div>
    `;
    
    topBar.querySelector('.page-title').insertAdjacentHTML('afterend', searchHTML);
};

window.handleGlobalSearch = function() {
    const query = document.getElementById('globalSearch').value.trim().toLowerCase();
    
    if (!query || query.length < 2) {
        alert('Inserisci almeno 2 caratteri per la ricerca');
        return;
    }
    
    // Search in stays
    const matchingStays = allStays.filter(stay => 
        stay.room_number.toLowerCase().includes(query) ||
        stay.last_name.toLowerCase().includes(query) ||
        (stay.email && stay.email.toLowerCase().includes(query))
    );
    
    if (matchingStays.length > 0) {
        showSection('stays');
        renderStaysTable(matchingStays);
        
        // Show alert with results
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = 'background: rgba(0,200,83,0.1); border: 2px solid rgba(0,200,83,0.3); color: #00c853; padding: 16px; border-radius: 14px; margin-bottom: 20px; font-weight: 700;';
        resultDiv.textContent = `✅ Trovati ${matchingStays.length} risultati per "${query}"`;
        
        const container = document.getElementById('stays-table-container');
        container.insertBefore(resultDiv, container.firstChild);
        
        setTimeout(() => resultDiv.remove(), 5000);
    } else {
        alert(`❌ Nessun risultato trovato per "${query}"`);
    }
};

// ============================================
// 2. COMUNICAZIONI (PLACEHOLDER)
// ============================================
window.sendNotificationToGuest = function(userEmail) {
    const message = prompt(`Invia messaggio a ${userEmail}:\n\n(Funzionalità email/push in sviluppo)`);
    if (message) {
        alert('📧 Funzionalità in sviluppo. Per ora annotare su carta!');
        // TODO: Integrate email service (SendGrid, etc)
    }
};

// ============================================
// 3. PROLUNGA SOGGIORNO (MODAL + FUNCTION)
// ============================================
window.initExtendStayModal = function() {
    if (document.getElementById('modalExtendStay')) return;
    
    const modalHTML = `
        <div class="modal-overlay" id="modalExtendStay">
            <div class="modal-content">
                <div class="modal-header">
                    <i data-lucide="calendar-plus" style="width: 28px; height: 28px;"></i>
                    <span>Prolunga Soggiorno</span>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 700; margin-bottom: 8px; color: #666;">
                            Numero di giorni da aggiungere:
                        </label>
                        <input 
                            type="number" 
                            id="extendDays" 
                            min="1" 
                            max="30" 
                            placeholder="Es: 3"
                            style="width: 100%; padding: 14px; border: 2px solid rgba(0,0,0,0.08); border-radius: 14px; font-weight: 700; font-size: 16px;"
                        >
                        <small style="color: #999; font-weight: 600; display: block; margin-top: 8px;">
                            Massimo 30 giorni per prolungamento
                        </small>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn danger" onclick="closeModal()">Annulla</button>
                    <button class="modal-btn primary" onclick="confirmExtendStay()">Conferma</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
};

window.openExtendStayModal = function(stayId) {
    window.initExtendStayModal();
    const modal = document.getElementById('modalExtendStay');
    const input = document.getElementById('extendDays');
    
    input.value = '';
    input.dataset.stayId = stayId;
    
    modal.classList.add('active');
};

window.confirmExtendStay = async function() {
    const input = document.getElementById('extendDays');
    const stayId = input.dataset.stayId;
    const days = parseInt(input.value);
    
    if (!days || days < 1 || days > 30) {
        alert('⚠️ Inserisci un numero valido di giorni (1-30)');
        return;
    }
    
    try {
        // Get admin email
        const adminSession = JSON.parse(localStorage.getItem('guestos_admin_session'));
        
        // Use Supabase function
        const { data, error } = await supabaseClient
            .rpc('extend_stay', {
                p_user_id: parseInt(stayId),
                p_days: days,
                p_admin_email: adminSession.email
            });
        
        if (error) throw error;
        
        const newDate = data[0]?.new_end_date;
        
        alert(`✅ Soggiorno prolungato di ${days} ${days === 1 ? 'giorno' : 'giorni'}!\n\nNuova data check-out: ${formatDate(newDate)}`);
        
        closeModal();
        loadActiveStays();
        loadOverviewStats();
        
    } catch (error) {
        console.error('Error extending stay:', error);
        alert('❌ Errore prolungamento soggiorno');
    }
};

// ============================================
// 4. EXPORT EXCEL
// ============================================
window.exportToExcel = function(type = 'stays') {
    alert('📊 Funzionalità export Excel in sviluppo.\n\nPer ora usa: Ctrl+P → Salva come PDF');
    
    // TODO: Implement with library like SheetJS
    // Example:
    // const wb = XLSX.utils.book_new();
    // const ws = XLSX.utils.json_to_sheet(data);
    // XLSX.utils.book_append_sheet(wb, ws, "Soggiorni");
    // XLSX.writeFile(wb, "report.xlsx");
};

// ============================================
// 5. ALERT DASHBOARD (SCADENZE OGGI)
// ============================================
window.initExpiryAlerts = async function() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabaseClient
            .from('users')
            .select('room_number, last_name')
            .eq('stay_end_date', today)
            .eq('active', true);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            const alertDiv = document.createElement('div');
            alertDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(255,160,0,0.95);
                backdrop-filter: blur(20px);
                color: white;
                padding: 20px;
                border-radius: 16px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.3);
                z-index: 9999;
                max-width: 350px;
                font-weight: 700;
                border: 3px solid rgba(255,255,255,0.3);
            `;
            
            alertDiv.innerHTML = `
                <div style="font-size: 20px; margin-bottom: 10px;">⚠️ Check-out Oggi</div>
                <div style="font-size: 14px; line-height: 1.6;">
                    ${data.length} ${data.length === 1 ? 'ospite parte' : 'ospiti partono'} oggi:<br>
                    ${data.map(s => `• Camera ${s.room_number} (${s.last_name})`).join('<br>')}
                </div>
                <button onclick="this.parentElement.remove()" style="margin-top: 15px; background: rgba(255,255,255,0.2); border: 2px solid white; color: white; padding: 8px 16px; border-radius: 10px; cursor: pointer; font-weight: 800; width: 100%;">
                    Ho capito
                </button>
            `;
            
            document.body.appendChild(alertDiv);
            
            // Auto-hide after 30 seconds
            setTimeout(() => alertDiv.remove(), 30000);
        }
        
    } catch (error) {
        console.error('Error loading expiry alerts:', error);
    }
};

// ============================================
// 6. GESTIONE PUNTI MANUALE
// ============================================
window.loadPointsManagement = async function() {
    const container = document.getElementById('points-management-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">⏳ Caricamento punti...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('user_points')
            .select('*')
            .order('points', { ascending: false });
        
        if (error) throw error;
        
        window.adminFeatures.allPoints = data || [];
        
        if (data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⭐</div>
                    <div class="empty-title">Nessun utente con punti</div>
                </div>
            `;
            return;
        }
        
        renderPointsTable(data);
        
    } catch (error) {
        console.error('Error loading points:', error);
        container.innerHTML = '<div class="loading">❌ Errore caricamento</div>';
    }
};

window.renderPointsTable = function(users) {
    const container = document.getElementById('points-management-container');
    
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Email</th>
                    <th>Punti</th>
                    <th>Livello</th>
                    <th>Ultima Attività</th>
                    <th>Azioni</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    users.forEach(user => {
        html += `
            <tr>
                <td><strong>${user.user_email}</strong></td>
                <td style="font-size: 20px; font-weight: 900; color: #FF0080;">${user.points || 0}</td>
                <td><span class="badge active">Livello ${user.level || 1}</span></td>
                <td>${user.updated_at ? formatDate(user.updated_at.split('T')[0]) : '-'}</td>
                <td>
                    <button class="btn-icon edit" onclick="adjustPoints('${user.user_email}', ${user.points})" title="Modifica punti">
                        <i data-lucide="edit-3" style="width: 18px; height: 18px;"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    lucide.createIcons();
};

window.adjustPoints = function(userEmail, currentPoints) {
    const adjustment = prompt(
        `Punti attuali: ${currentPoints}\n\n` +
        `Inserisci modifica:\n` +
        `+100 (aggiunge 100 punti)\n` +
        `-50 (rimuove 50 punti)\n` +
        `=200 (imposta a 200 punti)`
    );
    
    if (!adjustment) return;
    
    let newPoints = currentPoints;
    
    if (adjustment.startsWith('+')) {
        newPoints += parseInt(adjustment.substring(1));
    } else if (adjustment.startsWith('-')) {
        newPoints -= parseInt(adjustment.substring(1));
    } else if (adjustment.startsWith('=')) {
        newPoints = parseInt(adjustment.substring(1));
    } else {
        alert('❌ Formato non valido. Usa: +100, -50, oppure =200');
        return;
    }
    
    if (newPoints < 0) {
        alert('❌ I punti non possono essere negativi');
        return;
    }
    
    if (confirm(`Confermare modifica punti?\n${currentPoints} → ${newPoints}`)) {
        updateUserPoints(userEmail, newPoints);
    }
};

window.updateUserPoints = async function(userEmail, newPoints) {
    try {
        const { error } = await supabaseClient
            .from('user_points')
            .update({ 
                points: newPoints,
                updated_at: new Date().toISOString()
            })
            .eq('user_email', userEmail);
        
        if (error) throw error;
        
        alert('✅ Punti aggiornati con successo');
        loadPointsManagement();
        
    } catch (error) {
        console.error('Error updating points:', error);
        alert('❌ Errore aggiornamento punti');
    }
};

// ============================================
// 7. QUICK STATS (CAMERE OCCUPATE)
// ============================================
window.addQuickStats = function() {
    // Add to overview section after stats-grid
    const statsGrid = document.querySelector('#section-overview .stats-grid');
    if (!statsGrid || document.getElementById('quickStatsWidget')) return;
    
    const widgetHTML = `
        <div id="quickStatsWidget" style="margin-top: 20px;">
            <div class="data-section" style="background: rgba(255,255,255,0.92); backdrop-filter: blur(50px); border: 3px solid rgba(255,255,255,0.6); border-radius: 24px; padding: 25px;">
                <div class="section-header" style="border-bottom: none; margin-bottom: 15px; padding-bottom: 0;">
                    <div class="section-title" style="font-size: 18px;">🏨 Camere</div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
                    <div>
                        <div style="font-size: 32px; font-weight: 900; color: #00c853;" id="roomsOccupied">-</div>
                        <div style="font-size: 12px; color: #999; font-weight: 700;">Occupate</div>
                    </div>
                    <div>
                        <div style="font-size: 32px; font-weight: 900; color: #667eea;" id="roomsAvailable">-</div>
                        <div style="font-size: 12px; color: #999; font-weight: 700;">Libere</div>
                    </div>
                    <div>
                        <div style="font-size: 32px; font-weight: 900; color: #FF0080;" id="occupancyRate">-%</div>
                        <div style="font-size: 12px; color: #999; font-weight: 700;">Occupazione</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    statsGrid.insertAdjacentHTML('afterend', widgetHTML);
    updateQuickStats();
};

window.updateQuickStats = async function() {
    try {
        const TOTAL_ROOMS = 50; // TODO: Make configurable
        
        const { data, error } = await supabaseClient
            .from('users')
            .select('room_number', { count: 'exact', head: true })
            .eq('active', true);
        
        if (error) throw error;
        
        const occupied = data || 0;
        const available = TOTAL_ROOMS - occupied;
        const rate = Math.round((occupied / TOTAL_ROOMS) * 100);
        
        document.getElementById('roomsOccupied').textContent = occupied;
        document.getElementById('roomsAvailable').textContent = available;
        document.getElementById('occupancyRate').textContent = rate + '%';
        
    } catch (error) {
        console.error('Error loading room stats:', error);
    }
};

// ============================================
// 8. QR CODE (PLACEHOLDER)
// ============================================
window.generateQRCode = function(userId) {
    alert('📱 Funzionalità QR Code in sviluppo.\n\nRichiederà libreria QRCode.js');
    // TODO: Use qrcode.js library
    // Example: QRCode.toDataURL(`guestos://checkin/${userId}`)
};

// ============================================
// 9. NOTE INTERNE STAFF
// ============================================
window.addStaffNote = async function(userId) {
    const note = prompt('📝 Inserisci nota interna per questo ospite:\n(Visibile solo allo staff)');
    
    if (!note) return;
    
    try {
        const { error } = await supabaseClient
            .from('users')
            .update({ staff_notes: note })
            .eq('id', userId);
        
        if (error) throw error;
        
        alert('✅ Nota salvata con successo');
        loadActiveStays();
        
    } catch (error) {
        console.error('Error saving note:', error);
        alert('❌ Errore salvataggio nota');
    }
};

window.viewStaffNote = async function(userId) {
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('staff_notes, room_number, last_name')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        
        const note = data.staff_notes || '(Nessuna nota)';
        alert(`📝 Note Staff - Camera ${data.room_number} (${data.last_name}):\n\n${note}`);
        
    } catch (error) {
        console.error('Error loading note:', error);
    }
};

// ============================================
// 10. AUDIT LOG (STORICO)
// ============================================
window.viewAuditLog = async function() {
    try {
        const { data, error } = await supabaseClient
            .from('admin_audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            alert('📋 Nessuna attività registrata');
            return;
        }
        
        // Create modal with audit log
        const logHTML = data.map(log => {
            const date = new Date(log.created_at).toLocaleString('it-IT');
            const action = {
                'reset_pin': '🔑 Reset PIN',
                'extend_stay': '📅 Prolunga soggiorno',
                'deactivate': '❌ Disattiva',
                'adjust_points': '⭐ Modifica punti'
            }[log.action] || log.action;
            
            return `
                <div style="padding: 12px; background: rgba(0,0,0,0.02); border-radius: 10px; margin-bottom: 8px;">
                    <strong>${action}</strong> da ${log.admin_email}<br>
                    <small style="color: #999;">${date}</small>
                </div>
            `;
        }).join('');
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;';
        modal.innerHTML = `
            <div style="background: white; border-radius: 24px; padding: 30px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto;">
                <h2 style="margin-bottom: 20px; font-size: 24px; font-weight: 900;">📋 Storico Modifiche</h2>
                ${logHTML}
                <button onclick="this.closest('div[style*=fixed]').remove()" style="margin-top: 20px; width: 100%; padding: 14px; background: rgba(0,0,0,0.1); border: none; border-radius: 14px; font-weight: 800; cursor: pointer;">
                    Chiudi
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
    } catch (error) {
        console.error('Error loading audit log:', error);
        alert('❌ Errore caricamento storico');
    }
};

// ============================================
// BOOKINGS MANAGEMENT
// ============================================
window.loadRestaurantBookings = async function() {
    const container = document.getElementById('restaurant-bookings-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">⏳ Caricamento prenotazioni...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('restaurant_bookings')
            .select('*')
            .order('booking_date', { ascending: false })
            .order('booking_time', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        window.adminFeatures.allBookings.restaurant = data || [];
        
        if (data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🍽️</div>
                    <div class="empty-title">Nessuna prenotazione</div>
                </div>
            `;
            return;
        }
        
        renderRestaurantBookingsTable(data);
        
    } catch (error) {
        console.error('Error loading restaurant bookings:', error);
        container.innerHTML = '<div class="loading">❌ Errore caricamento</div>';
    }
};

window.renderRestaurantBookingsTable = function(bookings) {
    const container = document.getElementById('restaurant-bookings-container');
    
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Ora</th>
                    <th>Nome</th>
                    <th>Persone</th>
                    <th>Prezzo</th>
                    <th>Stato</th>
                    <th>Azioni</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    bookings.forEach(booking => {
        const statusClass = booking.status || 'pending';
        const statusText = {
            'pending': 'In attesa',
            'confirmed': 'Confermata',
            'completed': 'Completata',
            'cancelled': 'Annullata'
        }[booking.status] || 'Sconosciuto';
        
        html += `
            <tr>
                <td>${formatDate(booking.booking_date)}</td>
                <td><strong>${booking.booking_time || '-'}</strong></td>
                <td>${booking.user_name || '-'}<br><small style="color: #999;">${booking.user_email || ''}</small></td>
                <td>${booking.num_people} persone</td>
                <td>€${(booking.final_price || booking.original_price || 0).toFixed(2)}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <select onchange="changeBookingStatus('restaurant', ${booking.id}, this.value)" 
                            style="padding: 8px; border-radius: 8px; border: 2px solid rgba(0,0,0,0.1); font-weight: 700; font-size: 12px;">
                        <option value="">Cambia...</option>
                        <option value="confirmed">Conferma</option>
                        <option value="completed">Completata</option>
                        <option value="cancelled">Annulla</option>
                    </select>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
};

window.loadToursBookings = async function() {
    const container = document.getElementById('tours-bookings-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">⏳ Caricamento prenotazioni...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('tour_bookings')
            .select('*')
            .order('tour_date', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        window.adminFeatures.allBookings.tours = data || [];
        
        if (data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🚌</div>
                    <div class="empty-title">Nessuna prenotazione</div>
                </div>
            `;
            return;
        }
        
        renderToursBookingsTable(data);
        
    } catch (error) {
        console.error('Error loading tours bookings:', error);
        container.innerHTML = '<div class="loading">❌ Errore caricamento</div>';
    }
};

window.renderToursBookingsTable = function(bookings) {
    const container = document.getElementById('tours-bookings-container');
    
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Data Tour</th>
                    <th>Nome Tour</th>
                    <th>Ospite</th>
                    <th>Persone</th>
                    <th>Prezzo</th>
                    <th>Stato</th>
                    <th>Azioni</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    bookings.forEach(booking => {
        const statusClass = booking.status || 'pending';
        const statusText = {
            'pending': 'In attesa',
            'confirmed': 'Confermata',
            'completed': 'Completata',
            'cancelled': 'Annullata'
        }[booking.status] || 'Sconosciuto';
        
        html += `
            <tr>
                <td>${formatDate(booking.tour_date || booking.booking_date)}</td>
                <td><strong>${booking.tour_name || '-'}</strong></td>
                <td>${booking.user_name || '-'}<br><small style="color: #999;">${booking.user_email || ''}</small></td>
                <td>${booking.num_people} persone</td>
                <td>€${(booking.final_price || booking.original_price || 0).toFixed(2)}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <select onchange="changeBookingStatus('tour', ${booking.id}, this.value)" 
                            style="padding: 8px; border-radius: 8px; border: 2px solid rgba(0,0,0,0.1); font-weight: 700; font-size: 12px;">
                        <option value="">Cambia...</option>
                        <option value="confirmed">Conferma</option>
                        <option value="completed">Completata</option>
                        <option value="cancelled">Annulla</option>
                    </select>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
};

window.loadSpaBookings = async function() {
    const container = document.getElementById('spa-bookings-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">⏳ Caricamento prenotazioni...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('spa_bookings')
            .select('*')
            .order('booking_date', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        window.adminFeatures.allBookings.spa = data || [];
        
        if (data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💆</div>
                    <div class="empty-title">Nessuna prenotazione</div>
                </div>
            `;
            return;
        }
        
        renderSpaBookingsTable(data);
        
    } catch (error) {
        console.error('Error loading spa bookings:', error);
        container.innerHTML = '<div class="loading">❌ Errore caricamento</div>';
    }
};

window.renderSpaBookingsTable = function(bookings) {
    const container = document.getElementById('spa-bookings-container');
    
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Ora</th>
                    <th>Trattamento</th>
                    <th>Ospite</th>
                    <th>Durata</th>
                    <th>Prezzo</th>
                    <th>Stato</th>
                    <th>Azioni</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    bookings.forEach(booking => {
        const statusClass = booking.status || 'pending';
        const statusText = {
            'pending': 'In attesa',
            'confirmed': 'Confermata',
            'completed': 'Completata',
            'cancelled': 'Annullata'
        }[booking.status] || 'Sconosciuto';
        
        html += `
            <tr>
                <td>${formatDate(booking.booking_date)}</td>
                <td><strong>${booking.booking_time || '-'}</strong></td>
                <td>${booking.treatment_name || '-'}</td>
                <td>${booking.user_name || '-'}<br><small style="color: #999;">${booking.user_email || ''}</small></td>
                <td>${booking.duration_minutes || '-'} min</td>
                <td>€${(booking.final_price || booking.original_price || 0).toFixed(2)}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <select onchange="changeBookingStatus('spa', ${booking.id}, this.value)" 
                            style="padding: 8px; border-radius: 8px; border: 2px solid rgba(0,0,0,0.1); font-weight: 700; font-size: 12px;">
                        <option value="">Cambia...</option>
                        <option value="confirmed">Conferma</option>
                        <option value="completed">Completata</option>
                        <option value="cancelled">Annulla</option>
                    </select>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
};

window.changeBookingStatus = async function(type, bookingId, newStatus) {
    if (!newStatus) return;
    
    if (!confirm(`Cambiare stato prenotazione a "${newStatus}"?`)) {
        event.target.value = '';
        return;
    }
    
    try {
        const table = type === 'restaurant' ? 'restaurant_bookings' : 
                     type === 'tour' ? 'tour_bookings' : 'spa_bookings';
        
        const { error } = await supabaseClient
            .from(table)
            .update({ status: newStatus })
            .eq('id', bookingId);
        
        if (error) throw error;
        
        alert('✅ Stato aggiornato');
        
        if (type === 'restaurant') loadRestaurantBookings();
        else if (type === 'tour') loadToursBookings();
        else loadSpaBookings();
        
        loadOverviewStats();
        
    } catch (error) {
        console.error('Error changing booking status:', error);
        alert('❌ Errore aggiornamento stato');
    }
};

// ============================================
// REWARDS MANAGEMENT
// ============================================
window.loadRewardsManagement = async function() {
    const container = document.getElementById('rewards-management-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">⏳ Caricamento rewards...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('user_rewards')
            .select(`
                *,
                rewards (
                    name,
                    emoji,
                    points_required
                )
            `)
            .order('id', { ascending: false });
        
        if (error) throw error;
        
        window.adminFeatures.allRewards = data || [];
        
        if (data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎁</div>
                    <div class="empty-title">Nessun reward riscattato</div>
                </div>
            `;
            return;
        }
        
        renderRewardsTable(data);
        
    } catch (error) {
        console.error('Error loading rewards:', error);
        container.innerHTML = '<div class="loading">❌ Errore caricamento</div>';
    }
};

window.renderRewardsTable = function(rewards) {
    const container = document.getElementById('rewards-management-container');
    
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Premio</th>
                    <th>Utente</th>
                    <th>Data</th>
                    <th>Codice</th>
                    <th>Stato</th>
                    <th>Azioni</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    rewards.forEach(reward => {
        const statusClass = reward.status || 'pending';
        const statusText = {
            'pending': 'Da consegnare',
            'claimed': 'Consegnato'
        }[reward.status] || 'Sconosciuto';
        
        // Get date - try multiple possible column names
        const dateStr = reward.redeemed_at || reward.created_at || reward.date || '';
        const displayDate = dateStr ? formatDate(dateStr.split('T')[0]) : '-';
        
        html += `
            <tr>
                <td>
                    <span style="font-size: 24px;">${reward.rewards?.emoji || '🎁'}</span>
                    <strong>${reward.rewards?.name || 'Premio'}</strong>
                </td>
                <td>${reward.user_email}</td>
                <td>${displayDate}</td>
                <td><code style="background: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 6px; font-weight: 800;">${reward.code || 'N/A'}</code></td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    ${reward.status === 'pending' ? `
                        <button class="btn-icon view" onclick="markRewardClaimed(${reward.id})" title="Segna come consegnato">
                            <i data-lucide="check-circle" style="width: 18px; height: 18px;"></i>
                        </button>
                    ` : '✅'}
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    lucide.createIcons();
};

window.markRewardClaimed = async function(rewardId) {
    if (!confirm('Confermare consegna premio all\'ospite?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('user_rewards')
            .update({ status: 'claimed' })
            .eq('id', rewardId);
        
        if (error) throw error;
        
        alert('✅ Premio segnato come consegnato');
        loadRewardsManagement();
        
    } catch (error) {
        console.error('Error marking reward as claimed:', error);
        alert('❌ Errore aggiornamento stato');
    }
};

// ============================================
// UPDATE SECTION NAVIGATION
// ============================================
const originalShowSection = window.showSection;
window.showSection = function(sectionName) {
    originalShowSection(sectionName);
    
    // Load data for each section
    if (sectionName === 'bookings-restaurant') loadRestaurantBookings();
    else if (sectionName === 'bookings-tours') loadToursBookings();
    else if (sectionName === 'bookings-spa') loadSpaBookings();
    else if (sectionName === 'points') loadPointsManagement();
    else if (sectionName === 'rewards') loadRewardsManagement();
};

// ============================================
// UPDATE HTML STRUCTURE FOR NEW SECTIONS
// ============================================
window.injectBookingsContainers = function() {
    // Restaurant
    const restaurantSection = document.getElementById('section-bookings-restaurant');
    if (restaurantSection && !document.getElementById('restaurant-bookings-container')) {
        const dataSection = restaurantSection.querySelector('.data-section');
        if (dataSection) {
            dataSection.innerHTML = '<div id="restaurant-bookings-container"></div>';
        }
    }
    
    // Tours
    const toursSection = document.getElementById('section-bookings-tours');
    if (toursSection && !document.getElementById('tours-bookings-container')) {
        const dataSection = toursSection.querySelector('.data-section');
        if (dataSection) {
            dataSection.innerHTML = '<div id="tours-bookings-container"></div>';
        }
    }
    
    // Spa
    const spaSection = document.getElementById('section-bookings-spa');
    if (spaSection && !document.getElementById('spa-bookings-container')) {
        const dataSection = spaSection.querySelector('.data-section');
        if (dataSection) {
            dataSection.innerHTML = '<div id="spa-bookings-container"></div>';
        }
    }
    
    // Points
    const pointsSection = document.getElementById('section-points');
    if (pointsSection && !document.getElementById('points-management-container')) {
        const dataSection = pointsSection.querySelector('.data-section');
        if (dataSection) {
            dataSection.innerHTML = '<div id="points-management-container"></div>';
        }
    }
    
    // Rewards
    const rewardsSection = document.getElementById('section-rewards');
    if (rewardsSection && !document.getElementById('rewards-management-container')) {
        const dataSection = rewardsSection.querySelector('.data-section');
        if (dataSection) {
            dataSection.innerHTML = '<div id="rewards-management-container"></div>';
        }
    }
};

// ============================================
// AUTO-INITIALIZE ON LOAD
// ============================================
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log('🚀 Initializing Guestos Admin Features...');
        
        initGlobalSearch();
        initExtendStayModal();
        addQuickStats();
        injectBookingsContainers();
        initExpiryAlerts();
        
        console.log('✅ All features loaded!');
    }, 1000);
});

console.log('📦 Guestos Admin Features Module Loaded');
