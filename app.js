// ============================================
// GUESTOS - Main App JavaScript
// Navigazione, back button, registrazione Service Worker.
// Le prenotazioni NON passano più da qui: ogni pagina usa
// GuestOS.rpc('create_booking', ...) (vedi guest-session.js).
// ============================================

// ==========================================
// 1. NAVIGATION SYSTEM
// ==========================================

// Funzione per navigare tra le pagine
function navigateTo(page) {
    // Mappa delle pagine disponibili
    const pages = {
        'home': 'index.html',
        'chat': 'chat.html',
        'ristorante': 'ristorante.html',
        'spa': 'spa.html',
        'tours': 'tours.html',
        'lastminute': 'lastminute.html',
        'tour-detail': 'tour-detail.html',
        'escursioni': 'tours.html', // Alias
        'animazione': 'animazione.html',
        'games': 'games.html',
        'leaderboard': 'leaderboard.html',
        'rewards': 'rewards.html',
        'account': 'account.html',
        'privacy': 'privacy.html'
    };

    const targetPage = pages[String(page || '').toLowerCase()];

    if (targetPage) {
        window.location.href = targetPage;
    } else {
        console.error('Pagina non trovata:', page);
    }
}

// Funzione per tornare indietro
function goBack() {
    // Se c'è storia, torna indietro
    if (window.history.length > 1) {
        window.history.back();
    } else {
        // Altrimenti vai alla home
        window.location.href = 'index.html';
    }
}

// Usata da alcune CTA "Chatta con Bubbles" (onclick nell'HTML)
window.chatWithBubbles = function () {
    navigateTo('chat');
};

// ==========================================
// 2. HOMEPAGE - Quick Actions Setup
// ==========================================

function setupHomepage() {
    // Solo se siamo nella homepage
    if (!document.querySelector('.quick-actions')) return;

    const actionCards = document.querySelectorAll('.action-card');

    actionCards.forEach(card => {
        card.addEventListener('click', function () {
            const labelEl = this.querySelector('.action-label');
            const label = labelEl ? labelEl.textContent.trim() : '';

            // Mappa azioni → pagine
            const actionMap = {
                'Ristorante': 'ristorante',
                'Escursioni': 'tours',
                'Animazione': 'animazione',
                'Spa & Relax': 'spa',
                'Last Minute': 'lastminute',
                'Giochi': 'games'
            };

            const targetPage = actionMap[label];
            if (targetPage) {
                navigateTo(targetPage);
            }
        });
    });

    // Bottone principale "Chatta con Bubbles"
    const chatBtn = document.querySelector('.chat-btn');
    if (chatBtn) {
        chatBtn.addEventListener('click', () => navigateTo('chat'));
    }
}

// ==========================================
// 3. BACK BUTTONS Setup
// ==========================================

function setupBackButtons() {
    const backButtons = document.querySelectorAll('.back-btn');

    backButtons.forEach(btn => {
        // Non sovrascrivere pulsanti che hanno già un onclick esplicito nell'HTML
        if (btn.getAttribute('onclick')) return;
        btn.addEventListener('click', goBack);
    });
}

// ==========================================
// 4. FILTER TABS (pagine catalogo: solo stato visivo)
// ==========================================

function setupFilterTabs() {
    const filterTabs = document.querySelectorAll('.filter-tab');
    if (!filterTabs.length) return;
    filterTabs.forEach(tab => {
        // app-data-loader.js può assegnare un proprio onclick; qui solo il toggle visivo
        tab.addEventListener('click', function () {
            filterTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// ==========================================
// 5. INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', function () {
    setupBackButtons();
    setupHomepage();
    setupFilterTabs();
});

// ==========================================
// 6. SERVICE WORKER REGISTRATION (SW unico: service-worker.js)
// ==========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => {
                // Se c'è una nuova versione in attesa, attivala subito
                if (reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    if (!nw) return;
                    nw.addEventListener('statechange', () => {
                        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                            nw.postMessage({ type: 'SKIP_WAITING' });
                        }
                    });
                });
            })
            .catch(err => console.warn('Service Worker registration failed:', err));
    });
}
