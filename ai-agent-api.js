/**
 * AI Agent API - client per la chat "Bubbles" (GuestOS)
 *
 * - Invia a /api/chat la storia della conversazione (ultimi 20 messaggi in memoria di pagina).
 * - Persiste su Supabase tramite le RPC SECURITY DEFINER di supabase/migrations/004_ai.sql
 *   (log_ai_message, get_my_ai_history, submit_ai_feedback) col token di sessione ospite
 *   esposto da guest-session.js (window.GuestOS.token()).
 * - Nessun accesso diretto alle tabelle ai_* dal browser.
 *
 * Richiede: config.js + guest-session.js caricati prima di questo file.
 */

const CHAT_API_URL = '/api/chat';
const HISTORY_LIMIT = 20;
const MESSAGE_CHAR_LIMIT = 2000;

/** Storia della conversazione tenuta in memoria di pagina: [{role, content}] */
let conversationHistory = [];
/** Id (uuid) della conversazione persistita, se disponibile */
let currentConversationId = null;

function getGuestToken() {
    try {
        const t = window.GuestOS && typeof window.GuestOS.token === 'function' ? window.GuestOS.token() : null;
        return t || null;
    } catch (_) {
        return null;
    }
}

/**
 * Chiama una RPC Supabase. Preferisce GuestOS.rpc (contratto guest-session.js);
 * in sua assenza usa supabaseClient.rpc e sbusta {data, error}.
 */
async function callRpc(name, params) {
    if (window.GuestOS && typeof window.GuestOS.rpc === 'function') {
        return window.GuestOS.rpc(name, params);
    }
    const db = window.supabaseClient;
    if (!db) throw new Error('Supabase client non disponibile');
    const { data, error } = await db.rpc(name, params);
    if (error) throw error;
    return data;
}

function pushHistory(role, content) {
    const text = String(content || '').slice(0, MESSAGE_CHAR_LIMIT);
    if (!text) return;
    conversationHistory.push({ role, content: text });
    if (conversationHistory.length > HISTORY_LIMIT) {
        conversationHistory = conversationHistory.slice(-HISTORY_LIMIT);
    }
}

function getLocalBubblesResponse(message) {
    const text = String(message || '').toLowerCase();

    if (text.includes('ristorante') || text.includes('cena') || text.includes('pranzo') || text.includes('tavolo')) {
        return 'Per orari e prenotazione del ristorante apri la pagina Ristorante dell’app 🍽️';
    }
    if (text.includes('spa') || text.includes('massaggio') || text.includes('sauna') || text.includes('benessere')) {
        return 'Per orari e trattamenti della SPA apri la pagina Spa dell’app 💆';
    }
    if (text.includes('tour') || text.includes('escurs') || text.includes('barca')) {
        return 'Le escursioni disponibili sono nella pagina Escursioni 🚢';
    }
    if (text.includes('check-out') || text.includes('checkout') || text.includes('partenza')) {
        return 'Per l’orario di check-out e richieste particolari contatta la reception 🕚';
    }
    if (text.includes('wifi') || text.includes('internet')) {
        return 'Il WiFi è gratuito in tutta la struttura 📶 Se hai problemi di connessione, la reception può aiutarti.';
    }
    if (text.includes('punti') || text.includes('premi') || text.includes('reward') || text.includes('gioch')) {
        return 'Puoi guadagnare punti con giochi e quiz 🎮 Poi li riscatti come sconti nella pagina Rewards.';
    }
    if (text.includes('last minute') || text.includes('offert') || text.includes('sconto')) {
        return 'Le offerte flash sono nella pagina Last Minute ⚡';
    }

    return 'Sono Bubbles, il tuo assistente 💧 Al momento rispondo in modalità base: posso indirizzarti a ristorante, SPA, escursioni, giochi, punti e offerte. Per tutto il resto contatta la reception.';
}

/**
 * Invia un messaggio all'assistente.
 * @param {string} message
 * @returns {Promise<{success:boolean, response:string, conversationId:string|null, actionType:string,
 *                    timestamp:string, fallback:boolean, messageId:string|null, model:string|null,
 *                    rateLimited?:boolean}>}
 */
async function sendMessageToAgent(message) {
    const startedAt = performance.now();
    const text = String(message || '').trim().slice(0, MESSAGE_CHAR_LIMIT);
    const actionType = detectActionType(text);
    const token = getGuestToken();
    const language = detectLanguage();

    pushHistory('user', text);

    // Persistenza del messaggio utente (best-effort, non blocca la risposta).
    const userLog = token
        ? persistMessage(token, 'user', text, { action_type: actionType, language })
        : Promise.resolve(null);

    let reply;
    let fallback = true;
    let model = null;
    let rateLimited = false;

    try {
        const response = await fetch(CHAT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory, token })
        });

        let data = {};
        try { data = await response.json(); } catch (_) { data = {}; }

        if (response.status === 429) {
            rateLimited = true;
            reply = data.error || 'Hai inviato troppi messaggi in pochi minuti. Attendi qualche minuto e riprova.';
            model = 'rate-limited';
        } else if (response.ok && data.reply) {
            reply = String(data.reply);
            fallback = data.fallback === true;
            model = data.model || (fallback ? 'local-fallback' : 'claude');
        } else {
            reply = getLocalBubblesResponse(text);
            model = 'local-fallback';
        }
    } catch (error) {
        console.error('Error sending message to agent:', error);
        reply = getLocalBubblesResponse(text);
        model = 'local-fallback';
    }

    if (!rateLimited) pushHistory('assistant', reply);

    let messageId = null;
    if (token) {
        await userLog.catch(() => null);
        const saved = await persistMessage(token, 'assistant', reply, {
            action_type: actionType,
            model,
            fallback,
            rate_limited: rateLimited || undefined,
            language,
            response_time_ms: Math.round(performance.now() - startedAt)
        }).catch(() => null);
        messageId = saved && saved.message_id ? saved.message_id : null;
    }

    if (actionType && actionType !== 'info' && typeof window.handleAIAction === 'function') {
        try { window.handleAIAction(actionType, {}); } catch (_) { /* opzionale */ }
    }

    return {
        success: true,
        response: reply,
        conversationId: currentConversationId,
        actionType,
        timestamp: new Date().toISOString(),
        fallback,
        messageId,
        model,
        rateLimited
    };
}

/**
 * Salva un messaggio via RPC log_ai_message. Aggiorna currentConversationId.
 * @returns {Promise<{conversation_id:string, message_id:string}|null>}
 */
async function persistMessage(token, role, content, meta) {
    try {
        const result = await callRpc('log_ai_message', {
            p_token: token,
            p_conversation_id: currentConversationId,
            p_role: role,
            p_content: content,
            p_meta: meta || {}
        });
        if (result && result.conversation_id) currentConversationId = result.conversation_id;
        return result || null;
    } catch (error) {
        console.warn('log_ai_message non riuscito:', error && error.message ? error.message : error);
        return null;
    }
}

/**
 * Carica l'ultima conversazione dell'ospite (RPC get_my_ai_history) e riempie la storia in memoria.
 * @param {number} limit
 * @returns {Promise<Array<{id:string, role:string, content:string, created_at:string, metadata:object, rating:number|null}>>}
 */
async function loadAgentHistory(limit = 30) {
    const token = getGuestToken();
    if (!token) return [];
    try {
        const result = await callRpc('get_my_ai_history', { p_token: token, p_limit: limit });
        const messages = Array.isArray(result && result.messages) ? result.messages : [];
        currentConversationId = (result && result.conversation_id) || null;
        conversationHistory = [];
        messages
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .slice(-HISTORY_LIMIT)
            .forEach(m => pushHistory(m.role, m.content));
        return messages;
    } catch (error) {
        console.warn('get_my_ai_history non riuscito:', error && error.message ? error.message : error);
        return [];
    }
}

/**
 * Feedback su una risposta dell'assistente (RPC submit_ai_feedback).
 * Il server accetta solo due valori: 1 (utile) e -1 (non utile).
 * @param {string} messageId uuid di ai_messages
 * @param {number} rating 1 = utile, -1 = non utile
 * @param {string|null} comment
 * @returns {Promise<boolean>}
 */
async function submitAgentFeedback(messageId, rating, comment = null) {
    const token = getGuestToken();
    if (!token || !messageId) return false;
    const normalized = Number(rating) < 0 ? -1 : 1;
    try {
        const ok = await callRpc('submit_ai_feedback', {
            p_token: token,
            p_message_id: messageId,
            p_rating: normalized,
            p_comment: comment
        });
        return ok === true || ok === null || ok === undefined ? ok !== false : Boolean(ok);
    } catch (error) {
        console.warn('submit_ai_feedback non riuscito:', error && error.message ? error.message : error);
        return false;
    }
}

/** Azzera la storia in memoria (nuova conversazione al prossimo messaggio). */
function resetAgentConversation() {
    conversationHistory = [];
    currentConversationId = null;
}

function getAgentConversationId() {
    return currentConversationId;
}

function detectActionType(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('ristorante') || text.includes('tavolo') || text.includes('cena')) return 'booking_restaurant';
    if (text.includes('spa') || text.includes('massaggio') || text.includes('sauna')) return 'booking_spa';
    if (text.includes('tour') || text.includes('escurs') || text.includes('barca')) return 'booking_tour';
    return 'info';
}

/**
 * Check agent status
 * @returns {Promise<Object>} Agent status
 */
async function getAgentStatus() {
    try {
        const response = await fetch(CHAT_API_URL, { method: 'OPTIONS' });
        return { online: response.ok, status: response.ok ? 'available' : 'unavailable' };
    } catch (error) {
        return { online: false, status: 'unavailable', error: error.message };
    }
}

/**
 * Detect user language from browser
 * @returns {string} Language code
 */
function detectLanguage() {
    const lang = (navigator.language || navigator.userLanguage || 'it').toLowerCase();
    if (lang.startsWith('it')) return 'it';
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('de')) return 'de';
    if (lang.startsWith('fr')) return 'fr';
    return 'it';
}

/**
 * Format message for display
 * @param {Object} message - Message object from get_my_ai_history
 */
function formatMessage(message) {
    return {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: new Date(message.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        metadata: message.metadata || {},
        rating: message.rating ?? null
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendMessageToAgent,
        loadAgentHistory,
        submitAgentFeedback,
        resetAgentConversation,
        getAgentConversationId,
        detectActionType,
        getAgentStatus,
        formatMessage
    };
}
