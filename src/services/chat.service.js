const redis = require('../config/redis');
const supabase = require('../config/supabase');
const ragService = require('./rag.service'); // Import service mới
const GeminiProvider = require('../providers/gemini.provider');
const OneMinProvider = require('../providers/onemin.provider');

const providers = {
    gemini: new GeminiProvider(),
    onemin: new OneMinProvider()
};

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

            // --- LỚP 1: CACHING & RULES ---
            // Check Redis
            const cachedAnswer = await redis.get(cacheKey);
            if (cachedAnswer) {
                logData.handled_by_layer = 1;
                logData.provider = 'redis_cache';
                logData.bot_response = cachedAnswer;
                await this.saveLog(logData, startTime);
                return cachedAnswer;
            }

            // Check Rules (Xã giao)
            if (/^(hi|hello|chào|xin chào)$/i.test(question)) {
                const greeting = "Chào bạn! Tôi là trợ lý ảo hỗ trợ doanh nghiệp. Tôi chỉ có thể trả lời các câu hỏi nằm trong phạm vi tài liệu hệ thống.";
                logData.handled_by_layer = 1;
                logData.provider = 'rule_base';
                logData.bot_response = greeting;
                await this.saveLog(logData, startTime);
                return greeting;
            }

            // --- LỚP 2: RAG SEARCH (STRICT MODE) ---
            
            // Tìm kiếm với ngưỡng thấp nhất chấp nhận được (ví dụ 0.4)
            // Nếu dưới mức này -> Câu hỏi không liên quan đến doanh nghiệp
            const documents = await ragService.searchKnowledgeBase(question, 0.4);

            // CASE 1: Hoàn toàn không tìm thấy thông tin liên quan
            if (documents.length === 0) {
                const fallback = ragService.getFallbackResponse();
                logData.handled_by_layer = 2;
                logData.provider = 'fallback_system';
                logData.bot_response = fallback;
                
                // Không cache câu trả lời này lâu (hoặc không cache)
                await this.saveLog(logData, startTime);
                return fallback;
            }

            // CASE 2: Tìm thấy, nhưng có 1 kết quả cực kỳ chính xác (> 0.85) -> Trả lời ngay (tùy chọn)
            // Ở đây ta vẫn nên đưa qua AI để rephrase cho tự nhiên, trừ khi muốn tiết kiệm tối đa.
            // Để hệ thống "mượt", ta sẽ gom context và đẩy sang Lớp 3.

            // Chuẩn bị Context
            const contextText = ragService.formatContext(documents);

            // --- LỚP 3: AI GENERATION (WITH STRICT PROMPT) ---
            
            // Ưu tiên 1minAI
            let providerName = 'onemin'; 
            let responseText = "";

            try {
                responseText = await providers['onemin'].generateResponse(question, contextText);
            } catch (err) {
                console.error(`1minAI failed, switch to Gemini. Error: ${err.message}`);
                providerName = 'gemini';
                responseText = await providers['gemini'].generateResponse(question, contextText);
            }

            logData.handled_by_layer = 3;
            logData.provider = providerName;
            logData.bot_response = responseText;
            
            // Cache kết quả
            await redis.set(cacheKey, responseText, { ex: 3600 });
            await this.saveLog(logData, startTime);
            return responseText;

        } catch (error) {
            console.error("System Error:", error);
            return "Hệ thống đang bận, vui lòng thử lại sau.";
        }
    }

    async saveLog(logData, startTime) {
        logData.latency_ms = Date.now() - startTime;
        await supabase.from('chat_logs').insert(logData);
    }
}

module.exports = new ChatService();