const axios = require("axios");
const IAIProvider = require("./ai.interface");
const { logger } = require("../utils/logger");

/**
 * Mistral AI Provider
 * Uses Mistral AI API for LLM responses
 */
class MistralProvider extends IAIProvider {
    constructor() {
        super();
        this.apiKey = process.env.MISTRAL_API_KEY;
        this.model = process.env.MISTRAL_MODEL || "mistral-small-2506";
        this.baseUrl = "https://api.mistral.ai/v1";
    }

    /**
     * Generate a response using Mistral AI
     * @param {string} userQuestion - User's question
     * @param {string} context - RAG context
     * @returns {Promise<string>} - AI response
     */
    async generateResponse(userQuestion, context) {
        const { getChatPrompt } = require('../config/prompts');
        const prompt = getChatPrompt(userQuestion, context);
        const startTime = Date.now();

        try {
            // Log API key for development debugging
            // logger.info('MistralAI', `API Key: ${this.apiKey}`);
            logger.info('MistralAI', `Sending request with model: ${this.model}`);

            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    model: this.model
                },
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            const content = response.data?.choices?.[0]?.message?.content;
            const duration = Date.now() - startTime;

            if (content) {
                const result = content.trim();
                // Log LLM call
                logger.llm('mistral', this.model, userQuestion, result, duration, true);
                return result;
            }

            logger.warn('MistralAI', 'No content in response');
            logger.llm('mistral', this.model, userQuestion, null, duration, false, 'No content in response');
            return "Xin lỗi, tôi không thể xử lý yêu cầu này lúc này.";

        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error.response?.data?.error?.message || error.message;

            logger.error('MistralAI', 'API Error', { error: errorMsg });
            logger.llm('mistral', this.model, userQuestion, null, duration, false, errorMsg);

            throw new Error("Mistral AI Provider Failed");
        }
    }

    /**
     * Generate embeddings using Mistral AI
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} - Embedding vector
     */
    async generateEmbedding(text) {
        try {
            // Log API key for development debugging
            // logger.info('MistralAI', `Embedding API Key: ${this.apiKey}`);
            logger.info('MistralAI', `Sending embedding request with model: mistral-embed`);

            const response = await axios.post(
                `${this.baseUrl}/embeddings`,
                {
                    model: "mistral-embed",
                    input: [text]
                },
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            const embedding = response.data?.data?.[0]?.embedding;

            if (embedding) {
                return embedding;
            }

            throw new Error("No embedding returned");

        } catch (error) {
            logger.error('MistralAI', 'Embedding error', {
                error: error.response?.data || error.message
            });
            throw error;
        }
    }
}

module.exports = MistralProvider;
