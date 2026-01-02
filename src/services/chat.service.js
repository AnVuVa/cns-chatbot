const redis = require('../config/redis');
const supabase = require('../config/supabase');
const ragService = require('./rag.service');
const { logger } = require('../utils/logger');
const GeminiProvider = require('../providers/gemini.provider');
const OneMinProvider = require('../providers/onemin.provider');
const MistralProvider = require('../providers/mistral.provider');

// ============================================
// PROVIDER CONFIGURATION
// ============================================
const providers = {
    gemini: new GeminiProvider(),
    onemin: new OneMinProvider(),
    mistral: new MistralProvider()
};

const PRIMARY_PROVIDER = process.env.LLM_PROVIDER || 'onemin';
const FALLBACK_PROVIDER = process.env.LLM_FALLBACK_PROVIDER || 'gemini';

logger.info('ChatService', `Primary LLM Provider: ${PRIMARY_PROVIDER}`);
logger.info('ChatService', `Fallback LLM Provider: ${FALLBACK_PROVIDER}`);

// ============================================
// CONVERSATION MEMORY (P2)
// In-memory storage with 30-minute TTL
// ============================================
const conversationStore = new Map();
const CONVERSATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CONVERSATION_HISTORY = 10; // Keep last 10 exchanges

/**
 * Get or create conversation for a user
 * @param {string} userId - User identifier (PSID for Messenger)
 * @returns {Object} - Conversation object
 */
function getConversation(userId) {
    const now = Date.now();
    let conversation = conversationStore.get(userId);

    if (conversation) {
        // Check if expired
        if (now - conversation.lastActivity > CONVERSATION_TTL_MS) {
            // Save expired conversation to database before clearing
            saveConversationToDatabase(userId, conversation);
            conversation = null;
        }
    }

    if (!conversation) {
        conversation = {
            userId,
            history: [],
            createdAt: now,
            lastActivity: now
        };
        conversationStore.set(userId, conversation);
    }

    return conversation;
}

/**
 * Add exchange to conversation history
 * @param {string} userId - User identifier
 * @param {string} userMessage - User's message
 * @param {string} botResponse - Bot's response
 */
function addToConversation(userId, userMessage, botResponse) {
    const conversation = getConversation(userId);

    conversation.history.push({
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
    });

    conversation.history.push({
        role: 'assistant',
        content: botResponse,
        timestamp: Date.now()
    });

    // Keep only last N exchanges
    if (conversation.history.length > MAX_CONVERSATION_HISTORY * 2) {
        conversation.history = conversation.history.slice(-MAX_CONVERSATION_HISTORY * 2);
    }

    conversation.lastActivity = Date.now();
}

/**
 * Format conversation history for LLM context
 * @param {Array} history - Conversation history
 * @returns {string} - Formatted context
 */
function formatConversationContext(history) {
    if (!history || history.length === 0) return '';

    return '\n[LỊCH SỬ HỘI THOẠI GẦN ĐÂY]\n' +
        history.map(msg => {
            const role = msg.role === 'user' ? 'Người dùng' : 'Trợ lý';
            return `${role}: ${msg.content}`;
        }).join('\n') + '\n';
}

/**
 * Save expired conversation to database for future training
 * @param {string} userId - User identifier
 * @param {Object} conversation - Conversation object
 */
async function saveConversationToDatabase(userId, conversation) {
    if (conversation.history.length < 2) return; // Don't save empty conversations

    try {
        await supabase.from('conversation_archive').insert({
            user_id: userId,
            conversation_data: conversation.history,
            started_at: new Date(conversation.createdAt).toISOString(),
            ended_at: new Date(conversation.lastActivity).toISOString(),
            message_count: conversation.history.length
        });
        logger.info('ChatService', `Archived conversation for ${userId}`, {
            messages: conversation.history.length
        });
    } catch (error) {
        // Don't throw - archiving failures shouldn't break the flow
        logger.warn('ChatService', 'Failed to archive conversation', { error: error.message });
    }

    // Remove from memory
    conversationStore.delete(userId);
}

// Periodic cleanup of expired conversations (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [userId, conversation] of conversationStore.entries()) {
        if (now - conversation.lastActivity > CONVERSATION_TTL_MS) {
            saveConversationToDatabase(userId, conversation);
        }
    }
}, 5 * 60 * 1000);

// ============================================
// CHAT SERVICE
// ============================================
class ChatService {
    /**
     * Process a user message through the pipeline
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session UUID
     * @param {string} question - User's question
     * @returns {Promise<string>} - Bot response
     */
    async processMessage(userId, sessionId, question) {
        const timings = {
            total: Date.now(),
            cache: 0,
            rag: 0,
            llm: 0
        };

        let logData = {
            session_id: sessionId,
            user_question: question,
            provider: null,
            latency_ms: 0,
            handled_by_layer: 0,
            bot_response: ""
        };

        try {
            const cacheKey = `chat:${Buffer.from(question).toString('base64').substring(0, 100)}`;

            // ============================================
            // LAYER 1: CACHE LOOKUP
            // ============================================
            const cacheStart = Date.now();
            const cachedAnswer = await redis.get(cacheKey);
            timings.cache = Date.now() - cacheStart;

            if (cachedAnswer) {
                logger.info('ChatService', 'Cache hit', {
                    cacheKey: cacheKey.substring(0, 30),
                    cache_time_ms: timings.cache
                });
                logData.handled_by_layer = 1;
                logData.provider = 'redis_cache';
                logData.bot_response = cachedAnswer;

                // Still add to conversation even from cache
                addToConversation(userId, question, cachedAnswer);

                await this.saveLog(logData, timings.total);
                return cachedAnswer;
            }

            // ============================================
            // LAYER 2: RAG SEARCH
            // ============================================
            const ragStart = Date.now();
            let documents = [];
            try {
                documents = await ragService.searchKnowledgeBase(question, 0.4);
                timings.rag = Date.now() - ragStart;
                logger.info('ChatService', `RAG completed`, {
                    documents: documents.length,
                    rag_time_ms: timings.rag
                });
            } catch (ragError) {
                timings.rag = Date.now() - ragStart;
                logger.warn('ChatService', 'RAG search failed', {
                    error: ragError.message,
                    rag_time_ms: timings.rag
                });
            }

            // Prepare context
            const ragContext = ragService.formatContext(documents);

            // Get conversation history for context
            const conversation = getConversation(userId);
            const conversationContext = formatConversationContext(conversation.history);

            // Combine contexts
            const fullContext = ragContext + conversationContext;

            logData.handled_by_layer = documents.length > 0 ? 2 : 3;

            // ============================================
            // LAYER 3: LLM GENERATION
            // ============================================
            const llmStart = Date.now();
            let providerName = PRIMARY_PROVIDER;
            let responseText = "";

            try {
                if (!providers[providerName]) {
                    throw new Error(`Provider '${providerName}' not available`);
                }
                responseText = await providers[providerName].generateResponse(question, fullContext);
            } catch (err) {
                logger.warn('ChatService', `${PRIMARY_PROVIDER} failed, switching to ${FALLBACK_PROVIDER}`, {
                    error: err.message
                });
                providerName = FALLBACK_PROVIDER;

                if (!providers[providerName]) {
                    throw new Error(`Fallback provider '${providerName}' not available`);
                }
                responseText = await providers[providerName].generateResponse(question, fullContext);
            }

            timings.llm = Date.now() - llmStart;

            logData.handled_by_layer = 3;
            logData.provider = providerName;
            logData.bot_response = responseText;

            // Add to conversation memory
            addToConversation(userId, question, responseText);

            // Cache result (shorter TTL for conversation-aware responses)
            await redis.set(cacheKey, responseText, { ex: 1800 }); // 30 min cache

            // Log performance metrics
            const totalTime = Date.now() - timings.total;
            logger.info('ChatService', 'Pipeline completed', {
                total_ms: totalTime,
                cache_ms: timings.cache,
                rag_ms: timings.rag,
                llm_ms: timings.llm,
                provider: providerName,
                documents: documents.length
            });

            await this.saveLog(logData, timings.total);
            return responseText;

        } catch (error) {
            logger.error('ChatService', 'System Error', {
                error: error.message,
                stack: error.stack
            });
            return "Hệ thống đang bận, vui lòng thử lại sau.";
        }
    }

    /**
     * Save chat log to database
     */
    async saveLog(logData, startTime) {
        logData.latency_ms = Date.now() - startTime;
        try {
            await supabase.from('chat_logs').insert(logData);
        } catch (error) {
            logger.error('ChatService', 'Failed to save log', { error: error.message });
        }
    }

    /**
     * Get active conversation count (for monitoring)
     */
    getActiveConversations() {
        return conversationStore.size;
    }

    /**
     * Clear a user's conversation (manual reset)
     */
    clearConversation(userId) {
        conversationStore.delete(userId);
    }
}

module.exports = new ChatService();
