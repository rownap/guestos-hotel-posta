/**
 * AI Agent API - Backend Integration
 * Hotel Posta - AI Receptionist
 * 
 * This module handles communication between the chat UI and the Vercel AI function.
 */

const CHAT_API_URL = '/api/chat';

function getDbClient() {
    return window.supabaseClient || null;
}

function makeLocalConversationId() {
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canPersistUser(userId) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId || '');
}

function getLocalBubblesResponse(message) {
    const text = message.toLowerCase();

    if (text.includes('ristorante') || text.includes('cena') || text.includes('pranzo') || text.includes('tavolo')) {
        return 'Il ristorante è aperto 12:30-14:30 e 19:30-22:00 🍽️ Puoi prenotare dalla pagina Ristorante dell’app.';
    }
    if (text.includes('spa') || text.includes('massaggio') || text.includes('sauna') || text.includes('benessere')) {
        return 'La SPA è aperta dalle 10:00 alle 20:00 💆 Vai nella pagina Spa per scegliere trattamento e orario.';
    }
    if (text.includes('tour') || text.includes('escurs') || text.includes('barca') || text.includes('tropea')) {
        return 'Le escursioni disponibili sono nella pagina Escursioni 🚢 Trovi tour in barca, trekking e percorsi enogastronomici.';
    }
    if (text.includes('check-out') || text.includes('checkout') || text.includes('partenza')) {
        return 'Il check-out è entro le 11:00 🕚 Per esigenze particolari chiama la reception digitando 0 dalla camera.';
    }
    if (text.includes('wifi') || text.includes('internet')) {
        return 'Il WiFi è gratuito in tutta la struttura 📶 Se hai problemi di connessione, la reception può aiutarti subito.';
    }
    if (text.includes('punti') || text.includes('premi') || text.includes('reward') || text.includes('giochi')) {
        return 'Puoi guadagnare punti con giochi e quiz 🎮 Poi li riscatti come sconti nella pagina Rewards.';
    }
    if (text.includes('last minute') || text.includes('offerta') || text.includes('sconto')) {
        return 'Le offerte flash sono nella pagina Last Minute ⚡ Controllala spesso: alcune promozioni durano poche ore.';
    }

    return 'Sono Bubbles, il tuo assistente dell’Hotel Posta 💧 Posso aiutarti con ristorante, SPA, tour, giochi, punti, offerte e informazioni sul soggiorno.';
}

/**
 * Send message to AI agent via the Vercel function.
 * @param {string} message - User message
 * @param {string} userId - User ID from Supabase auth
 * @param {string} conversationId - Conversation ID (optional, will create new if not provided)
 * @returns {Promise<Object>} AI response
 */
async function sendMessageToAgent(message, userId, conversationId = null) {
    const startedAt = performance.now();

    try {
        if (!conversationId) {
            conversationId = await createConversation(userId).catch(() => makeLocalConversationId());
        }

        await saveMessage(conversationId, 'user', message).catch(() => {});

        const response = await fetch(CHAT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: message }]
            })
        });

        const data = await response.json();
        const aiUnavailable = !response.ok || !data.reply;
        const reply = aiUnavailable ? getLocalBubblesResponse(message) : data.reply;
        const actionType = detectActionType(message);

        await saveMessage(conversationId, 'assistant', reply, {
            action_type: actionType,
            model: aiUnavailable ? 'local-fallback' : 'claude-haiku',
            response_time_ms: Math.round(performance.now() - startedAt)
        }).catch(() => {});

        if (actionType && actionType !== 'info' && typeof handleAIAction === 'function') {
            handleAIAction(actionType, {});
        }

        return {
            success: true,
            response: reply,
            conversationId: conversationId,
            actionType: actionType,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('Error sending message to agent:', error);
        return {
            success: true,
            response: getLocalBubblesResponse(message),
            conversationId: conversationId || makeLocalConversationId(),
            actionType: detectActionType(message),
            timestamp: new Date().toISOString(),
            fallback: true
        };
    }
}

function detectActionType(message) {
    const text = message.toLowerCase();
    if (text.includes('ristorante') || text.includes('tavolo') || text.includes('cena')) return 'booking_restaurant';
    if (text.includes('spa') || text.includes('massaggio') || text.includes('sauna')) return 'booking_spa';
    if (text.includes('tour') || text.includes('escurs') || text.includes('barca')) return 'booking_tour';
    return 'info';
}

/**
 * Create a new conversation
 * @param {string} userId - User ID
 * @returns {Promise<string>} Conversation ID
 */
async function createConversation(userId) {
    const db = getDbClient();
    if (!db || !canPersistUser(userId)) return makeLocalConversationId();

    const { data, error } = await db
        .from('ai_conversations')
        .insert({
            user_id: userId,
            status: 'active',
            language: detectLanguage() || 'it'
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating conversation:', error);
        throw error;
    }

    return data.id;
}

/**
 * Save message to database
 * @param {string} conversationId - Conversation ID
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 * @param {Object} metadata - Additional metadata
 */
async function saveMessage(conversationId, role, content, metadata = {}) {
    const db = getDbClient();
    if (!db || conversationId.startsWith('local-')) return;

    const { error } = await db
        .from('ai_messages')
        .insert({
            conversation_id: conversationId,
            role: role,
            content: content,
            metadata: metadata,
            tokens_used: metadata.tokens_used,
            response_time_ms: metadata.response_time_ms
        });

    if (error) {
        console.error('Error saving message:', error);
    }
}

/**
 * Save action to database
 * @param {string} conversationId - Conversation ID
 * @param {string} actionType - Type of action
 * @param {Object} actionData - Action data
 */
async function saveAction(conversationId, actionType, actionData) {
    const db = getDbClient();
    if (!db || conversationId.startsWith('local-')) return;

    const { error } = await db
        .from('ai_actions')
        .insert({
            conversation_id: conversationId,
            action_type: actionType,
            action_data: actionData,
            status: 'pending'
        });

    if (error) {
        console.error('Error saving action:', error);
    }
}

/**
 * Get conversation history
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Number of messages to retrieve
 * @returns {Promise<Array>} Array of messages
 */
async function getConversationHistory(conversationId, limit = 20) {
    const db = getDbClient();
    if (!db || !conversationId || conversationId.startsWith('local-')) return [];

    const { data, error } = await db
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('Error getting conversation history:', error);
        return [];
    }

    return data;
}

/**
 * Get active conversation for user
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Active conversation or null
 */
async function getActiveConversation(userId) {
    const db = getDbClient();
    if (!db || !canPersistUser(userId)) return null;

    const { data, error } = await db
        .from('ai_conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('last_message_at', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error getting active conversation:', error);
        return null;
    }

    return data;
}

/**
 * Submit feedback for a message
 * @param {string} messageId - Message ID
 * @param {number} rating - 1 for thumbs up, -1 for thumbs down
 * @param {string} comment - Optional comment
 */
async function submitFeedback(messageId, rating, comment = null) {
    const db = getDbClient();
    const userId = localStorage.getItem('guestos_user_id');

    if (!db || !userId) {
        console.error('User not authenticated');
        return;
    }

    // Get conversation ID from message
    const { data: message } = await db
        .from('ai_messages')
        .select('conversation_id')
        .eq('id', messageId)
        .single();

    if (!message) {
        console.error('Message not found');
        return;
    }

    const { error } = await db
        .from('ai_feedback')
        .insert({
            message_id: messageId,
            conversation_id: message.conversation_id,
            user_id: userId,
            rating: rating,
            comment: comment
        });

    if (error) {
        console.error('Error submitting feedback:', error);
    } else {
        console.log('Feedback submitted successfully');
    }
}

/**
 * Execute a booking action
 * @param {string} actionType - Type of booking
 * @param {Object} bookingDetails - Booking details
 * @returns {Promise<Object>} Booking result
 */
async function executeBookingAction(actionType, bookingDetails) {
    try {
        let tableName;

        switch (actionType) {
            case 'booking_restaurant':
                tableName = 'restaurant_bookings';
                break;
            case 'booking_tour':
                tableName = 'tour_bookings';
                break;
            case 'booking_spa':
                tableName = 'spa_bookings';
                break;
            default:
                throw new Error(`Unknown booking type: ${actionType}`);
        }

        const db = getDbClient();
        if (!db) throw new Error('Database non disponibile');

        const { data, error } = await db
            .from(tableName)
            .insert({
                ...bookingDetails,
                created_via: 'ai_agent',
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        return {
            success: true,
            booking: data
        };

    } catch (error) {
        console.error('Error executing booking:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Check agent status
 * @returns {Promise<Object>} Agent status
 */
async function getAgentStatus() {
    try {
        const response = await fetch(CHAT_API_URL, { method: 'OPTIONS' });

        return {
            online: response.ok,
            status: response.ok ? 'available' : 'unavailable'
        };
    } catch (error) {
        return {
            online: false,
            status: 'unavailable',
            error: error.message
        };
    }
}

/**
 * Detect user language from browser
 * @returns {string} Language code
 */
function detectLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    if (lang.startsWith('it')) return 'it';
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('de')) return 'de';
    if (lang.startsWith('fr')) return 'fr';
    return 'it'; // Default to Italian
}

/**
 * Format message for display
 * @param {Object} message - Message object from database
 * @returns {Object} Formatted message
 */
function formatMessage(message) {
    return {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: new Date(message.created_at).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        }),
        metadata: message.metadata
    };
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendMessageToAgent,
        getConversationHistory,
        getActiveConversation,
        submitFeedback,
        executeBookingAction,
        getAgentStatus,
        formatMessage
    };
}
