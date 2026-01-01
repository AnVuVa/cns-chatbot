const { GoogleGenerativeAI } = require("@google/generative-ai");
const IAIProvider = require('./ai.interface');
const { getChatPrompt } = require('../config/prompts');
const { logger } = require('../utils/logger');

class GeminiProvider extends IAIProvider {
  constructor() {
    super();
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  async generateResponse(userQuestion, context) {
    const model = this.genAI.getGenerativeModel({ model: this.model });
    const prompt = getChatPrompt(userQuestion, context);
    const startTime = Date.now();

    try {
      logger.info('GeminiAI', `Sending request with model: ${this.model}`);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      const duration = Date.now() - startTime;

      logger.llm('gemini', this.model, userQuestion, responseText, duration, true);
      return responseText;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('GeminiAI', 'API Error', { error: error.message });
      logger.llm('gemini', this.model, userQuestion, null, duration, false, error.message);

      throw new Error("Gemini Provider Failed");
    }
  }

  /**
   * Generate embeddings using Gemini
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - Embedding vector (768 dimensions)
   */
  async generateEmbedding(text) {
    try {
      const embeddingModel = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
      const result = await embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      logger.error('GeminiAI', 'Embedding error', { error: error.message });
      throw error;
    }
  }
}

module.exports = GeminiProvider;