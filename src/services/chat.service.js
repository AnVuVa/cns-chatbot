const redis = require('../config/redis');
const supabase = require('../config/supabase');
const ragService = require('./rag.service');
const { logger } = require('../utils/logger');
const GeminiProvider = require('../providers/gemini.provider');
const OneMinProvider = require('../providers/onemin.provider');
const MistralProvider = require('../providers/mistral.provider');

// Initialize all providers
const providers = {
    gemini: new GeminiProvider(),
    onemin: new OneMinProvider(),
    mistral: new MistralProvider()
};

// Get preferred provider from env, default to 'onemin'
const PRIMARY_PROVIDER = process.env.LLM_PROVIDER || 'onemin';
const FALLBACK_PROVIDER = process.env.LLM_FALLBACK_PROVIDER || 'gemini';

logger.info('ChatService', `Primary LLM Provider: ${PRIMARY_PROVIDER}`);
logger.info('ChatService', `Fallback LLM Provider: ${FALLBACK_PROVIDER}`);

class ChatService {
    async processMessage(userId, sessionId, question) {
        const startTime = Date.now();
        let logData = {
            session_id: sessionId,
            user_question: question,
            provider: null,
            latency_ms: 0,
            handled_by_layer: 0,
            bot_response: ""
        };

        try {
            const cacheKey = `chat:${Buffer.from(question).toString('base64')}`;

            // --- LỚP 1: CACHING ---
            // Check Redis for cached response
            const cachedAnswer = await redis.get(cacheKey);
            if (cachedAnswer) {
                logger.info('ChatService', 'Cache hit', { cacheKey: cacheKey.substring(0, 50) });
                logData.handled_by_layer = 1;
                logData.provider = 'redis_cache';
                logData.bot_response = cachedAnswer;
                await this.saveLog(logData, startTime);
                return cachedAnswer;
            }

            // --- LỚP 2: RAG SEARCH ---
            // Tìm kiếm thông tin liên quan trong knowledge base
            let documents = [];
            try {
                documents = await ragService.searchKnowledgeBase(question, 0.4);
                logger.info('ChatService', `RAG found ${documents.length} relevant documents`);
            } catch (ragError) {
                logger.warn('ChatService', 'RAG search failed, continuing without context', { error: ragError.message });
            }

            // Chuẩn bị Context (có thể rỗng - LLM sẽ xử lý)
            const contextText = ragService.formatContext(documents);

            // Đánh dấu layer dựa trên có context hay không
            logData.handled_by_layer = documents.length > 0 ? 2 : 3;

            // --- LỚP 3: AI GENERATION ---
            // LLM xử lý tất cả - kể cả greetings và khi không có context

            let providerName = PRIMARY_PROVIDER;
            let responseText = "";

            try {
                // Try primary provider
                if (!providers[providerName]) {
                    throw new Error(`Provider '${providerName}' not available`);
                }
                responseText = await providers[providerName].generateResponse(question, contextText);
            } catch (err) {
                logger.warn('ChatService', `${PRIMARY_PROVIDER} failed, switching to ${FALLBACK_PROVIDER}`, { error: err.message });
                providerName = FALLBACK_PROVIDER;

                if (!providers[providerName]) {
                    throw new Error(`Fallback provider '${providerName}' not available`);
                }
                responseText = await providers[providerName].generateResponse(question, contextText);
            }

            logData.handled_by_layer = 3;
            logData.provider = providerName;
            logData.bot_response = responseText;

            // Cache kết quả
            await redis.set(cacheKey, responseText, { ex: 3600 });
            await this.saveLog(logData, startTime);
            return responseText;

        } catch (error) {
            logger.error('ChatService', 'System Error', { error: error.message, stack: error.stack });
            return "Hệ thống đang bận, vui lòng thử lại sau.";
        }
    }

    async saveLog(logData, startTime) {
        logData.latency_ms = Date.now() - startTime;
        try {
            await supabase.from('chat_logs').insert(logData);
        } catch (error) {
            logger.error('ChatService', 'Failed to save log to database', { error: error.message });
        }
    }
}

module.exports = new ChatService();