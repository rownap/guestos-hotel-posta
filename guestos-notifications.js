/**
 * GUESTOS NOTIFICATIONS SERVICE
 * Gestisce il real-time via Supabase per Admin e Utenti
 */

document.addEventListener('DOMContentLoaded', () => {
    initNotificationService();
});

function initNotificationService() {
    console.log('🔔 Notification Service Initializing...');

    // 1. ADMIN SIDE: Notifica nuovi utenti registrati
    if (window.location.pathname.includes('admin')) {
        subscribeToNewUsers();
    }

    // 2. USER SIDE: Notifica nuove offerte lampo
    if (window.location.pathname.includes('index.html') ||
        window.location.pathname.includes('dynamic-home.html') ||
        window.location.pathname === '/' ||
        window.location.pathname.endsWith('posta_1/') ||
        window.location.pathname.endsWith('/')) {
        subscribeToFlashDeals();

        // Chiedi permesso per notifiche Push (Background)
        // In produzione, legare questo a un bottone utente per UX migliore
        setTimeout(() => {
            subscribeToPushNotifications();
        }, 3000);
    }
}

// PUBLIC VAPID KEY (Generata per Web Push)
const PUBLIC_VAPID_KEY = 'BM6uP6OdmqBjMaQJscqXh9W6lKiiJi2yEF0wIZ72h_OWznPh-D1aLPYOvBq-U36ujetYsTrljI484RPz0Pf-TPw';

async function subscribeToPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        return;
    }

    try {
        // 1. Register Service Worker
        const register = await navigator.serviceWorker.register('/sw.js');
        console.log('SW Registered for Push');

        // 2. Check Permission
        if (Notification.permission === 'denied') {
            console.log('Push permission denied');
            return;
        }

        // 3. Request Permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // 4. Subscribe
        const subscription = await register.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
        });

        // 5. Save to Supabase
        await saveSubscriptionToDB(subscription);

    } catch (err) {
        console.error('Error subscribing to push:', err);
    }
}

async function saveSubscriptionToDB(subscription) {
    const { endpoint, keys } = subscription.toJSON();
    const userEmail = localStorage.getItem('guestos_user_email');

    await supabaseClient.from('user_push_subscriptions').upsert({
        endpoint: endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_email: userEmail,
        user_agent: navigator.userAgent
    }, { onConflict: 'endpoint' });

    console.log('✅ Push Subscription saved!');
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * [ADMIN] Sottoscrizione alla tabella users
 */
function subscribeToNewUsers() {
    const channel = supabaseClient
        .channel('admin-notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
            const newUser = payload.new;
            showAdminAlert(`🆕 Nuovo Lead! <b>${newUser.full_name || 'Un utente'}</b> si è appena registrato!`);
        })
        .subscribe();
}

/**
 * Tracks which flash deals have already been notified to avoid duplicates
 */
function hasBeenNotified(dealId) {
    const notified = JSON.parse(localStorage.getItem('guestos_notified_deals') || '[]');
    return notified.includes(dealId);
}

function markAsNotified(dealId) {
    const notified = JSON.parse(localStorage.getItem('guestos_notified_deals') || '[]');
    if (!notified.includes(dealId)) {
        notified.push(dealId);
        // Keep only the last 50 deal IDs to prevent localStorage bloat
        if (notified.length > 50) notified.shift();
        localStorage.setItem('guestos_notified_deals', JSON.stringify(notified));
    }
}

/**
 * [USER] Sottoscrizione alla tabella flash_deals
 */
function subscribeToFlashDeals() {
    const channel = supabaseClient
        .channel('user-notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flash_deals' }, (payload) => {
            const newDeal = payload.new;
            // Only show if active AND not already notified
            if (newDeal.status === 'active' && !hasBeenNotified(newDeal.id)) {
                showFlashDealBanner(newDeal);
            }
        })
        .subscribe();

    // Controlla anche se ce n'è una già attiva al caricamento
    checkActiveFlashDeals();
}

/**
 * Mostra alert premium in dashboard admin
 */
function showAdminAlert(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'premium-toast';
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        border: 2px solid #FF0080;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 15px;
        animation: slideInRight 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    alertDiv.innerHTML = `
        <div style="font-size: 24px;">🚀</div>
        <div>
            <div style="font-weight: 800; color: #FF0080; font-size: 14px; text-transform: uppercase;">Notifica Admin</div>
            <div style="color: #333; font-size: 15px; font-weight: 600;">${message}</div>
        </div>
    `;

    document.body.appendChild(alertDiv);

    // Rimuovi dopo 5 secondi
    setTimeout(() => {
        alertDiv.style.animation = 'slideOutRight 0.5s forwards';
        setTimeout(() => alertDiv.remove(), 500);
    }, 5000);
}

/**
 * Mostra banner animato in home page
 */
function showFlashDealBanner(deal, silent = false) {
    // Skip if already notified for this deal
    if (deal.id && hasBeenNotified(deal.id)) {
        console.log('🔕 Deal already notified, skipping:', deal.id);
        return;
    }

    // Mark as notified BEFORE showing to prevent duplicates
    if (deal.id) {
        markAsNotified(deal.id);
    }

    // Rimuovi banner esistente se presente
    const existing = document.getElementById('flash-deal-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'flash-deal-banner';
    banner.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 320px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        border-radius: 16px;
        padding: 16px;
        z-index: 9999;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        border: 1px solid rgba(255, 0, 128, 0.2);
        animation: slideInRight 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex;
        flex-direction: column;
        gap: 12px;
    `;

    const serviceEmoji = { 'spa': '💆', 'restaurant': '🍽️', 'tour': '🚢', 'bar': '🍹' };
    const emoji = serviceEmoji[deal.service_type] || '⚡';

    banner.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="
                background: linear-gradient(135deg, #FF0080, #764ba2);
                width: 40px; height: 40px;
                border-radius: 10px;
                display: flex; align-items: center; justify-content: center;
                color: white; font-size: 20px;
                flex-shrink: 0;
            ">${emoji}</div>
            
            <div style="flex: 1;">
                <div style="color: #FF0080; font-weight: 800; font-size: 13px; text-transform: uppercase; margin-bottom: 2px;">Offerta Lampo!</div>
                <div style="color: #333; font-weight: 700; font-size: 15px; line-height: 1.3;">Sconto ${deal.discount_pct}% su ${deal.service_type.toUpperCase()}</div>
                <div id="flash-countdown" style="
                    color: #666; font-size: 12px; font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 4px;
                ">
                    ⏳ 00:00
                </div>
            </div>

            <button onclick="this.parentElement.parentElement.remove()" style="
                border: none; background: transparent; color: #999; cursor: pointer; padding: 0; font-size: 18px; line-height: 1;
            ">✕</button>
        </div>

        <div id="fd-audio-fallback" style="display: none; padding: 10px; background: rgba(255, 0, 128, 0.1); border-radius: 10px; text-align: center; border: 1px dashed #FF0080;">
             <button onclick="playNotificationSound(); this.parentElement.style.display='none'" style="border: none; background: transparent; color: #FF0080; font-weight: 800; cursor: pointer; font-size: 12px;">
                🔔 CLICCA QUI PER SENTIRE IL SUONO
             </button>
        </div>

        <button onclick="window.location.href='lastminute.html#flash-offers'" style="
            width: 100%;
            background: linear-gradient(90deg, #FF0080, #FF3399);
            color: white;
            border: none;
            padding: 10px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            text-transform: uppercase;
            box-shadow: 0 4px 12px rgba(255, 0, 128, 0.3);
            transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            Vedi Offerta →
        </button>
    `;

    document.body.appendChild(banner);

    // Suono notifica (solo se non silenzioso)
    if (!silent) {
        playNotificationSound();
    }

    // Inizia countdown
    startCountdown(new Date(deal.expires_at), banner);
}

// Gestione Sblocco Audio (Browser Policy)
let audioUnlocked = false;
let preloadedAudio = null;

function unlockAudio() {
    if (audioUnlocked) return;

    preloadedAudio = new Audio('assets/notification.mp3');
    preloadedAudio.volume = 0;
    preloadedAudio.play()
        .then(() => {
            audioUnlocked = true;
            console.log('✅ Audio sbloccato con successo');
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        })
        .catch(e => console.warn('⏳ In attesa di sblocco audio...', e));
}

document.addEventListener('click', unlockAudio);
document.addEventListener('touchstart', unlockAudio);

function playNotificationSound() {
    // Se l'audio non è sbloccato, proviamo comunque a caricare l'oggetto
    if (!preloadedAudio) {
        preloadedAudio = new Audio('assets/notification.mp3');
    }

    preloadedAudio.volume = 0.5;
    preloadedAudio.currentTime = 0;

    preloadedAudio.play()
        .then(() => {
            console.log('🔔 Suono riprodotto');
            const fallback = document.getElementById('fd-audio-fallback');
            if (fallback) fallback.style.display = 'none';
        })
        .catch(e => {
            console.warn('🔇 Audio bloccato dal browser. L\'utente deve interagire con la pagina.', e);
            const fallback = document.getElementById('fd-audio-fallback');
            if (fallback) fallback.style.display = 'block';
        });
}

function startCountdown(endTime, bannerEl) {
    const timer = setInterval(() => {
        const now = new Date().getTime();
        const distance = endTime - now;

        if (distance < 0) {
            clearInterval(timer);
            bannerEl.style.animation = 'fadeOutUp 0.5s forwards';
            setTimeout(() => bannerEl.remove(), 500);
            return;
        }

        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        const cd = document.getElementById('flash-countdown');
        if (cd) cd.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

async function checkActiveFlashDeals() {
    try {
        const { data, error } = await supabaseClient
            .from('flash_deals')
            .select('*')
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        if (data && data.length > 0) {
            const deal = data[0];
            // Only show if not already notified during this session
            if (!hasBeenNotified(deal.id)) {
                showFlashDealBanner(deal, true); // Silent on page load
            } else {
                console.log('🔕 Active deal already notified, skipping:', deal.id);
            }
        }
    } catch (err) {
        console.error('Error checking active deals:', err);
    }
}

// Keyframes per animazioni CSS iniettati via JS
const style = document.createElement('style');
style.innerHTML = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    @keyframes bounceInDown {
        0% { opacity: 0; transform: translateY(-100px); }
        60% { opacity: 1; transform: translateY(20px); }
        80% { transform: translateY(-5px); }
        100% { transform: translateY(0); }
    }
    @keyframes fadeOutUp {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
    }
`;
document.head.appendChild(style);
