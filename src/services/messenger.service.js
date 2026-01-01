const messengerAdapter = require('../adapters/messenger.adapter');
const chatService = require('./chat.service');
const supabase = require('../config/supabase');
const { logger } = require('../utils/logger');

/**
 * Messenger Service
 * Handles business logic for Messenger integration
 */
class MessengerService {
    /**
     * Handle incoming webhook event from Facebook
     * @param {Object} event - Webhook event
     */
    async handleWebhookEvent(event) {
        const startTime = Date.now();
        const parsedEvent = messengerAdapter.parseIncomingEvent(event);

        if (!parsedEvent) {
            logger.info('Messenger', 'Ignoring non-message event');
            return;
        }

        const { senderId, text, type } = parsedEvent;

        logger.info('Messenger', `Incoming ${type} from ${senderId}`, { text: text?.substring(0, 100) });

        // Log incoming message
        await this.logMessage({
            psid: senderId,
            message_type: 'incoming',
            message_text: text,
            event_type: type
        });

        // Skip if no text content
        if (!text || text.trim() === '') {
            await messengerAdapter.sendTextMessage(
                senderId,
                'Xin lỗi, tôi chỉ có thể xử lý tin nhắn văn bản.'
            );
            return;
        }

        try {
            // Show typing indicator
            await messengerAdapter.sendTypingIndicator(senderId, true);

            // Get or create session for this user
            const sessionId = await this.getOrCreateSession(senderId);

            // Process message through existing chat service
            const response = await chatService.processMessage(
                senderId,  // userId = Facebook PSID
                sessionId,
                text
            );

            // Turn off typing indicator
            await messengerAdapter.sendTypingIndicator(senderId, false);

            // Send response back to user
            await messengerAdapter.sendTextMessage(senderId, response);

            const latency = Date.now() - startTime;
            logger.info('Messenger', `Response sent to ${senderId}`, { latency_ms: latency });

            // Log outgoing message
            await this.logMessage({
                psid: senderId,
                message_type: 'outgoing',
                message_text: text,
                response_text: response,
                latency_ms: latency
            });

        } catch (error) {
            logger.error('Messenger', 'Error processing message', {
                senderId,
                error: error.message
            });

            await messengerAdapter.sendTypingIndicator(senderId, false);
            await messengerAdapter.sendTextMessage(
                senderId,
                'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.'
            );
        }
    }

    /**
     * Get existing session or create new one for user
     * @param {string} psid - Facebook Page-Scoped User ID
     */
    async getOrCreateSession(psid) {
        // Check for existing session
        const { data: existingSession } = await supabase
            .from('chat_sessions')
            .select('id')
            .eq('user_id', `fb_${psid}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (existingSession) {
            return existingSession.id;
        }

        // Create new session
        const { data: newSession, error } = await supabase
            .from('chat_sessions')
            .insert({
                user_id: `fb_${psid}`,
                metadata: {
                    platform: 'messenger',
                    psid: psid
                }
            })
            .select('id')
            .single();

        if (error) {
            console.error('[Messenger] Failed to create session:', error);
            throw error;
        }

        return newSession.id;
    }

    /**
     * Log Messenger-specific message data
     * @param {Object} data - Log data
     */
    async logMessage(data) {
        try {
            await supabase.from('messenger_logs').insert({
                psid: data.psid,
                message_type: data.message_type,
                message_text: data.message_text,
                response_text: data.response_text || null,
                latency_ms: data.latency_ms || null,
                event_type: data.event_type || 'message'
            });
        } catch (error) {
            // Don't throw - logging failures shouldn't break the flow
            console.error('[Messenger] Logging error:', error.message);
        }
    }

    /**
     * Get statistics for Messenger usage
     * @param {Object} options - Filter options
     */
    async getStatistics(options = {}) {
        const { startDate, endDate } = options;

        let query = supabase
            .from('messenger_logs')
            .select('*', { count: 'exact' });

        if (startDate) {
            query = query.gte('created_at', startDate);
        }
        if (endDate) {
            query = query.lte('created_at', endDate);
        }

        const { data, count, error } = await query;

        if (error) throw error;

        // Calculate stats
        const incoming = data.filter(d => d.message_type === 'incoming').length;
        const outgoing = data.filter(d => d.message_type === 'outgoing').length;
        const avgLatency = data
            .filter(d => d.latency_ms)
            .reduce((sum, d) => sum + d.latency_ms, 0) / (outgoing || 1);

        const uniqueUsers = [...new Set(data.map(d => d.psid))].length;

        return {
            totalMessages: count,
            incomingMessages: incoming,
            outgoingMessages: outgoing,
            uniqueUsers,
            averageLatencyMs: Math.round(avgLatency)
        };
    }
}

module.exports = new MessengerService();
