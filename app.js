// ============================================
// GUESTOS - Main App JavaScript
// Gestisce navigazione, interazioni e logica PWA
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
        'animazione': 'animazione.html'
    };
    
    const targetPage = pages[page.toLowerCase()];
    
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

// ==========================================
// 2. HOMEPAGE - Quick Actions Setup
// ==========================================

function setupHomepage() {
    // Solo se siamo nella homepage
    if (!document.querySelector('.quick-actions')) return;
    
    const actionCards = document.querySelectorAll('.action-card');
    
    actionCards.forEach(card => {
        card.addEventListener('click', function() {
            const label = this.querySelector('.action-label').textContent.trim();
            
            // Mappa azioni → pagine
            const actionMap = {
                'Ristorante': 'ristorante',
                'Escursioni': 'tours',
                'Animazione': 'animazione',
                'Spa & Relax': 'spa'
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
        btn.addEventListener('click', goBack);
    });
}

// ==========================================
// 4. CHAT PAGE Functions
// ==========================================

function setupChatPage() {
    if (!document.querySelector('.chat-messages')) return;
    
    const input = document.querySelector('.chat-input');
    const sendBtn = document.querySelector('.send-btn');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    
    // Funzione per inviare messaggio
    function sendMessage() {
        if (!input.value.trim()) return;
        
        const messageText = input.value.trim();
        
        // Aggiungi messaggio utente
        addUserMessage(messageText);
        
        // Reset input
        input.value = '';
        
        // Mostra typing indicator
        if (typingIndicator) {
            typingIndicator.style.display = 'flex';
            scrollToBottom();
        }
        
        // Simula risposta dopo 1-2 secondi
        setTimeout(() => {
            if (typingIndicator) typingIndicator.style.display = 'none';
            addBubblesMessage(getBotResponse(messageText));
            scrollToBottom();
        }, 1500);
    }
    
    // Aggiungi messaggio utente
    function addUserMessage(text) {
        const messageHTML = `
            <div class="message user">
                <div class="message-avatar">👤</div>
                <div class="message-content">
                    <div class="message-bubble">${text}</div>
                    <div class="message-time">Adesso</div>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', messageHTML);
        scrollToBottom();
    }
    
    // Aggiungi messaggio Bubbles
    function addBubblesMessage(text) {
        const messageHTML = `
            <div class="message bubbles">
                <div class="message-avatar">💧</div>
                <div class="message-content">
                    <div class="message-bubble">${text}</div>
                    <div class="message-time">Adesso</div>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', messageHTML);
    }
    
    // Scroll to bottom
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Risposte bot semplici
    function getBotResponse(userMessage) {
        const msg = userMessage.toLowerCase();
        
        if (msg.includes('ristorante') || msg.includes('mangiare') || msg.includes('cena')) {
            return 'Il ristorante apre alle 19:30! 🍽️ Vuoi che ti prenoti un tavolo?';
        }
        if (msg.includes('spa') || msg.includes('massaggio') || msg.includes('relax')) {
            return 'La Spa è aperta dalle 10:00 alle 20:00! 💆 Posso prenotarti un trattamento?';
        }
        if (msg.includes('escursion') || msg.includes('tour') || msg.includes('gita')) {
            return 'Abbiamo tantissime escursioni! 🚢 Il Giro delle Isole è il più richiesto. Ti interessa?';
        }
        if (msg.includes('ciao') || msg.includes('buongiorno') || msg.includes('salve')) {
            return 'Ciao! 👋 Come posso aiutarti oggi?';
        }
        if (msg.includes('grazie')) {
            return 'Figurati! 😊 Sono qui se hai bisogno di altro!';
        }
        
        return 'Interessante! Posso aiutarti con ristorante, spa o escursioni. Cosa ti serve? 😊';
    }
    
    // Event listeners
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    // Quick reply buttons
    const quickReplyBtns = document.querySelectorAll('.quick-reply-btn');
    quickReplyBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const text = this.textContent.trim();
            input.value = text;
            sendMessage();
        });
    });
}

// ==========================================
// 5. RESTAURANT PAGE Functions
// ==========================================

function setupRestaurantPage() {
    if (!document.querySelector('.offer-card')) return;
    
    // Global bookTable function (called from HTML onclick)
    window.bookTable = function() {
        showNotification(
            '🎉 Fantastico!',
            'La tua Cena Romantica è prenotata per stasera alle 20:00!\n\nRiceverai conferma via email con tutti i dettagli.\n\nPrezzo: €45/persona'
        );
    };
    
    // Global chatWithBubbles (called from bottom CTA)
    window.chatWithBubbles = function() {
        navigateTo('chat');
    };
}

// ==========================================
// 6. SPA PAGE Functions
// ==========================================

function setupSpaPage() {
    if (!document.querySelector('.premium-package')) return;
    
    window.bookPremium = function() {
        showNotification(
            '🌟 Fantastico!',
            'Hai prenotato il PACCHETTO VIP RELAX TOTAL!\n\n✅ Include:\n- Massaggio Total Body (60 min)\n- Trattamento Viso Luxury (45 min)\n- Sauna e Bagno Turco illimitati\n- Tisana Detox e Frutta\n- Kit Benessere omaggio\n\n💰 Prezzo speciale: €85 (risparmi €35!)\n\nRiceverai conferma via email con l\'orario del tuo appuntamento.'
        );
    };
    
    window.bookTreatment = function(treatmentId) {
        const treatments = {
            1: 'Massaggio Rilassante (60 min) - €55',
            2: 'Trattamento Viso Luxury (45 min) - €48',
            3: 'Massaggio Hot Stone (75 min) - €68',
            4: 'Riflessologia Plantare (40 min) - €42',
            5: 'Percorso Sauna & Bagno Turco (2h) - €25'
        };
        showNotification('✅ Trattamento prenotato!', treatments[treatmentId] + '\n\nRiceverai conferma dell\'orario via email.');
    };
    
    window.chatWithBubbles = function() {
        navigateTo('chat');
    };
}

// ==========================================
// 7. TOURS PAGE Functions
// ==========================================

function setupToursPage() {
    if (!document.querySelector('.featured-tour')) return;
    
    window.bookFeaturedTour = function() {
        showNotification(
            '🎉 Fantastico!',
            'Hai prenotato il "Giro delle Isole Incantate" per domani!\n\n✅ Partenza: 9:00 dal porto\n✅ Prezzo: €55/persona\n✅ Include: pranzo, aperitivo, snorkeling\n\nRiceverai conferma via email!'
        );
    };
    
    window.bookTour = function(tourId) {
        const tours = {
            1: 'Tramonto in Barca a Vela - €38',
            2: 'Tour Archeologico Guidato - €42',
            3: 'Tour Enogastronomico - €48',
            4: 'Trekking Panoramico - €35'
        };
        showNotification('✅ Prenotazione confermata!', tours[tourId] + '\n\nRiceverai i dettagli via email.');
    };
    
    window.viewTour = function(tourId) {
        showNotification('📋 Dettagli Tour', 'Questa sezione mostrerà foto, recensioni, mappa e informazioni complete del tour.');
    };
    
    window.chatWithBubbles = function() {
        navigateTo('chat');
    };
    
    // Filter tabs
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            filterTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// ==========================================
// 8. NOTIFICATIONS / ALERTS
// ==========================================

function showNotification(title, message) {
    // Per ora usa alert, poi possiamo fare toast personalizzati
    alert(title + '\n\n' + message);
}

// ==========================================
// 9. PWA INSTALLATION
// ==========================================

function setupPWAInstall() {
    const installPopup = document.getElementById('installPopup');
    if (!installPopup) return;
    
    // Controlla se l'utente ha già visto il popup
    const popupShown = localStorage.getItem('installPopupShown');
    if (popupShown === 'true') {
        // Popup già mostrato, non mostrarlo più
        installPopup.style.display = 'none';
        return;
    }
    
    // Chiudi popup
    window.closePopup = function() {
        installPopup.style.animation = 'slideUpBounce 0.4s reverse';
        setTimeout(() => {
            installPopup.style.display = 'none';
        }, 400);
        // Salva che il popup è stato visto
        localStorage.setItem('installPopupShown', 'true');
    };
    
    // Installa app
    window.installApp = function() {
        showNotification(
            '🎉 Perfetto!',
            'Su iPhone: Tocca il pulsante "Condividi" ⬆️ in basso e seleziona "Aggiungi a Home"\n\nSu Android: Tocca i tre puntini ⋮ e seleziona "Aggiungi a schermata Home"'
        );
        closePopup();
        // Salva che il popup è stato visto
        localStorage.setItem('installPopupShown', 'true');
    };
    
    // Mostra popup dopo 30 secondi
    setTimeout(() => {
        if (installPopup && localStorage.getItem('installPopupShown') !== 'true') {
            installPopup.style.display = 'block';
        }
    }, 30000); // 30 secondi = 30000 millisecondi
}

// ==========================================
// 10. INITIALIZATION
// ==========================================

// Quando il DOM è pronto
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Guestos App Loaded');
    
    // Setup componenti comuni
    setupBackButtons();
    
    // Setup componenti specifici per pagina
    setupHomepage();
    setupChatPage();
    setupRestaurantPage();
    setupSpaPage();
    setupToursPage();
    setupPWAInstall();
    
    console.log('✅ All components initialized');
});

// ==========================================
// 11. SERVICE WORKER REGISTRATION
// ==========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('✅ Service Worker registered'))
            .catch(err => console.log('❌ Service Worker registration failed:', err));
    });
}
