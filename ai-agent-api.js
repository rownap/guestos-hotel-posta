/**
 * AI Agent API - Backend Integration
 * Hotel Posta - AI Receptionist
 * 
 * This module handles communication between the chat UI and n8n workflow
 */

// Configuration
// Configuration
// Webhook URL del workflow n8n su Hostinger (Produzione)
const N8N_WEBHOOK_URL = 'https://n8n.srv1079262.hstgr.cloud/webhook/ai-chat';
const N8N_WEBHOOK_SECRET = 'your-webhook-secret'; // Opzionale, per sicurezza

/**
 * Send message to AI agent via n8n webhook
 * @param {string} message - User message
 * @param {string} userId - User ID from Supabase auth
 * @param {string} conversationId - Conversation ID (optional, will create new if not provided)
 * @returns {Promise<Object>} AI response
 */
async function sendMessageToAgent(message, userId, conversationId = null) {
    try {
        // Get or create conversation
        if (!conversationId) {
            conversationId = await createConversation(userId);
        }

        // Save user message to database
        await saveMessage(conversationId, 'user', message);

        // Send to n8n webhook
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': N8N_WEBHOOK_SECRET
            },
            body: JSON.stringify({
                message: message,
                userId: userId,
                conversationId: conversationId,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(`n8n webhook failed: ${response.status}`);
        }

        const data = await response.json();

        // Save assistant response to database
        if (data.response) {
            await saveMessage(conversationId, 'assistant', data.response, {
                action_type: data.actionType,
                model: data.metadata?.model || 'gpt-4-turbo',
                tokens_used: data.metadata?.tokens_used,
                response_time_ms: data.metadata?.response_time_ms
            });
        }

        // If there's an action, save it
        if (data.actionType && data.actionType !== 'info') {
            await saveAction(conversationId, data.actionType, data.actionData);
        }

        // --- Start of modified section ---
        // Assuming addMessageToUI is defined elsewhere in the UI code
        if (data.success) {
            // Add AI response to chat
            // addMessageToUI('assistant', data.response); // This line is commented out as addMessageToUI is not defined in this file

            // Handle specific actions detected by AI
            if (data.actionType && data.actionType !== 'info') {
                handleAIAction(data.actionType, data.metadata);
            }
        }
        // --- End of modified section ---

        return {
            success: true,
            response: data.response,
            conversationId: conversationId,
            actionType: data.actionType,
            timestamp: data.timestamp
        };

    } catch (error) {
        console.error('Error sending message to agent:', error);

        // --- Start of modified section ---
        // Fallback response
        // Remove typing indicator if error
        const typingIndicator = document.querySelector('.typing-indicator'); // Assuming this is part of the UI
        if (typingIndicator) typingIndicator.remove();

        // addMessageToUI('assistant', 'Mi dispiace, ho avuto un piccolo problema tecnico. Riprova tra poco! 😓'); // This line is commented out as addMessageToUI is not defined in this file
        // --- End of modified section ---

        return {
            success: false,
            response: "Mi dispiace, sto avendo problemi tecnici. Per favore riprova tra poco o contatta la reception al numero +39 0963 123456.",
            error: error.message
        };
    }
}

/**
 * Create a new conversation
 * @param {string} userId - User ID
 * @returns {Promise<string>} Conversation ID
 */
async function createConversation(userId) {
    const { data, error } = await window.supabase
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
    const { error } = await window.supabase
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
    const { error } = await window.supabase
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
    const { data, error } = await window.supabase
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
    const { data, error } = await window.supabase
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
    const userId = window.supabase.auth.user()?.id;

    if (!userId) {
        console.error('User not authenticated');
        return;
    }

    // Get conversation ID from message
    const { data: message } = await window.supabase
        .from('ai_messages')
        .select('conversation_id')
        .eq('id', messageId)
        .single();

    if (!message) {
        console.error('Message not found');
        return;
    }

    const { error } = await window.supabase
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

        const { data, error } = await window.supabase
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
        // Ping the n8n webhook to check if it's alive
        const response = await fetch(N8N_WEBHOOK_URL + '/health', {
            method: 'GET',
            headers: {
                'X-Webhook-Secret': N8N_WEBHOOK_SECRET
            }
        });

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
