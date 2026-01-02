const axios = require('axios');

const MESSENGER_API_URL = 'https://graph.facebook.com/v18.0/me/messages';

/**
 * Messenger Platform Adapter
 * Handles communication with Facebook Messenger Send API
 */
class MessengerAdapter {
    constructor() {
        this.pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN;
    }

    /**
     * Parse incoming webhook event and extract message data
     * @param {Object} event - Webhook event from Facebook
     * @returns {Object|null} Parsed message data or null if not a text message
     */
    parseIncomingEvent(event) {
        const senderId = event.sender?.id;
        const message = event.message;
        const postback = event.postback;

        // Handle regular text message
        if (message && !message.is_echo) {
            return {
                type: 'message',
                senderId,
                text: message.text || '',
                messageId: message.mid,
                attachments: message.attachments || [],
                quickReply: message.quick_reply?.payload || null,
                timestamp: event.timestamp
            };
        }

        // Handle postback (button clicks)
        if (postback) {
            return {
                type: 'postback',
                senderId,
                text: postback.payload,
                title: postback.title,
                timestamp: event.timestamp
            };
        }

        return null;
    }

    /**
     * Send a text message to a user
     * @param {string} recipientId - Facebook PSID of recipient
     * @param {string} text - Message text to send
     */
    async sendTextMessage(recipientId, text) {
        const messageData = {
            recipient: { id: recipientId },
            message: { text },
            messaging_type: 'RESPONSE'
        };

        return this.callSendAPI(messageData);
    }

    /**
     * Reply to a message (same as send - Facebook doesn't support reply threading in Send API)
     * @param {string} recipientId - Facebook PSID of recipient
     * @param {string} text - Reply text
     * @param {string} originalMessageId - Not used, kept for compatibility
     */
    async replyToMessage(recipientId, text, originalMessageId) {
        // Note: Facebook Send API doesn't support reply_to parameter
        return this.sendTextMessage(recipientId, text);
    }

    /**
     * Send typing indicator (shows "..." in chat)
     * @param {string} recipientId - Facebook PSID
     * @param {boolean} isTyping - true to show typing, false to hide
     */
    async sendTypingIndicator(recipientId, isTyping = true) {
        const action = isTyping ? 'typing_on' : 'typing_off';

        const data = {
            recipient: { id: recipientId },
            sender_action: action
        };

        return this.callSendAPI(data);
    }

    /**
     * Send a message with quick reply buttons
     * @param {string} recipientId - Facebook PSID
     * @param {string} text - Message text
     * @param {Array} quickReplies - Array of quick reply options
     */
    async sendQuickReplies(recipientId, text, quickReplies) {
        const messageData = {
            recipient: { id: recipientId },
            message: {
                text,
                quick_replies: quickReplies.map(qr => ({
                    content_type: 'text',
                    title: qr.title,
                    payload: qr.payload
                }))
            },
            messaging_type: 'RESPONSE'
        };

        return this.callSendAPI(messageData);
    }

    /**
     * Call Facebook Send API
     * @param {Object} messageData - Message payload
     */
    async callSendAPI(messageData) {
        try {
            const response = await axios.post(
                MESSENGER_API_URL,
                messageData,
                {
                    params: { access_token: this.pageAccessToken },
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            console.log('[Messenger] Message sent successfully:', response.data.message_id);
            return { success: true, messageId: response.data.message_id };
        } catch (error) {
            const errorData = error.response?.data?.error;
            console.error('[Messenger] Send API Error:', errorData || error.message);

            return {
                success: false,
                error: errorData?.message || error.message,
                code: errorData?.code
            };
        }
    }

    /**
     * Get user profile information from Facebook
     * @param {string} psid - Page-scoped user ID
     */
    async getUserProfile(psid) {
        try {
            const response = await axios.get(
                `https://graph.facebook.com/v18.0/${psid}`,
                {
                    params: {
                        fields: 'first_name,last_name,profile_pic',
                        access_token: this.pageAccessToken
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('[Messenger] Get profile error:', error.response?.data || error.message);
            return null;
        }
    }
}

module.exports = new MessengerAdapter();
