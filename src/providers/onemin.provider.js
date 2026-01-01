const axios = require("axios");
const IAIProvider = require("./ai.interface");
const { getChatPrompt } = require("../config/prompts");
const { logger } = require("../utils/logger");

class OneMinProvider extends IAIProvider {
  constructor() {
    super();
    this.model = process.env.ONEMIN_MODEL || "gemini-2.5-flash"; //gemini-2.5-flash || gpt-4o
  }

  async generateResponse(userQuestion, context) {
    const prompt = getChatPrompt(userQuestion, context);
    const startTime = Date.now();

    const payload = {
      type: "CONTENT_GENERATOR_EMAIL_REPLY",
      model: this.model,
      conversationId: "CONTENT_GENERATOR_EMAIL_REPLY",
      promptObject: {
        tone: "professional",
        language: "Vietnamese",
        prompt: prompt,
      },
    };

    try {
      logger.info('1minAI', `Sending request with model: ${this.model}`);

      const response = await axios.post(
        "https://api.1min.ai/api/features",
        payload,
        {
          headers: {
            "API-KEY": process.env.ONEMIN_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      // 1. Lấy dữ liệu thô
      let rawData = response.data;

      // 2. Xử lý trường hợp API trả về chuỗi JSON (Double serialized)
      if (typeof rawData === "string") {
        try {
          rawData = JSON.parse(rawData);
        } catch (e) {
          logger.info('1minAI', 'Response is a plain string, using directly');
        }
      }

      // 3. TRÍCH XUẤT DỮ LIỆU (Deep Extraction)
      const extractedText =
        rawData?.aiRecord?.aiRecordDetail?.resultObject?.[0];

      const duration = Date.now() - startTime;

      if (extractedText) {
        logger.llm('onemin', this.model, userQuestion, extractedText, duration, true);
        return extractedText;
      }

      // 4. Fallback: Nếu cấu trúc thay đổi, cố gắng tìm text ở các trường khác
      const fallbackText = rawData?.output || rawData?.result || rawData?.text;
      if (fallbackText) {
        logger.llm('onemin', this.model, userQuestion, fallbackText, duration, true);
        return fallbackText;
      }

      // Nếu vẫn không lấy được, trả về lỗi
      logger.warn('1minAI', 'Cannot extract text from response', { rawDataKeys: Object.keys(rawData || {}) });
      logger.llm('onemin', this.model, userQuestion, null, duration, false, 'Cannot extract text from response');
      return "Xin lỗi, tôi đã có câu trả lời nhưng gặp lỗi định dạng hiển thị.";

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error.response?.data?.message || error.message;

      logger.error('1minAI', 'API Error', { error: errorMsg });
      logger.llm('onemin', this.model, userQuestion, null, duration, false, errorMsg);

      throw new Error("1minAI Provider Failed");
    }
  }
}

module.exports = OneMinProvider;
