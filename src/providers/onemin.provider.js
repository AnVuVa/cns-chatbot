const axios = require("axios");
const IAIProvider = require("./ai.interface");

class OneMinProvider extends IAIProvider {
  constructor() {
    super();
    this.model = "gemini-2.5-flash"; //gemini-2.5-flash || gpt-4o
  }

  async generateResponse(userQuestion, context) {
    const hackPrompt = `
    [SYSTEM KNOWLEDGE BASE]
    ${context}
    
    [USER QUESTION]
    ${userQuestion}
    
    [ROLE]
    You are a strictly regulated Customer Support Bot.
    
    [STRICT INSTRUCTIONS]
    1. ONLY use information provided in the [SYSTEM KNOWLEDGE BASE] above to answer.
    2. If the answer is NOT found in the Knowledge Base:
       - Do NOT invent an answer.
       - Do NOT use your outside general knowledge (e.g., do not write poems, code, or math unless it's in the docs).
       - Roles: Just politely say: "Xin lỗi, hiện tại tôi chưa có thông tin về vấn đề này trong tài liệu hệ thống. Bạn vui lòng liên hệ nhân viên hỗ trợ."
    3. FORMATTING:
       - No Subject line. No "Dear...". No "Best regards...".
       - Language: Vietnamese.
       - Tone: Professional, helpful, concise.
    `;

    const payload = {
      type: "CONTENT_GENERATOR_EMAIL_REPLY",
      model: this.model,
      conversationId: "CONTENT_GENERATOR_EMAIL_REPLY",
      promptObject: {
        tone: "professional",
        language: "Vietnamese",
        prompt: hackPrompt,
      },
    };

    try {
      console.log(`[1minAI] Sending request...`);

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
      // Ví dụ: "{\"aiRecord\": ...}"
      if (typeof rawData === "string") {
        try {
          rawData = JSON.parse(rawData);
        } catch (e) {
          console.log("[1minAI] Response is a plain string, using directly.");
        }
      }

      // 3. DEBUG: In ra cấu trúc cấp 1 để kiểm tra nếu vẫn lỗi
      // console.log("[1minAI] Parsed Data Keys:", Object.keys(rawData));

      // 4. TRÍCH XUẤT DỮ LIỆU (Deep Extraction)
      // Đường dẫn: aiRecord -> aiRecordDetail -> resultObject -> [0]
      const extractedText =
        rawData?.aiRecord?.aiRecordDetail?.resultObject?.[0];

      if (extractedText) {
        return extractedText;
      }

      // 5. Fallback: Nếu cấu trúc thay đổi, cố gắng tìm text ở các trường khác
      // Đôi khi nó nằm ở output hoặc result
      const fallbackText = rawData?.output || rawData?.result || rawData?.text;
      if (fallbackText) return fallbackText;

      // Nếu vẫn không lấy được, trả về lỗi để không hiện cục JSON xấu xí
      console.warn(
        "[1minAI] Cannot extract text from:",
        JSON.stringify(rawData)
      );
      return "Xin lỗi, tôi đã có câu trả lời nhưng gặp lỗi định dạng hiển thị.";
    } catch (error) {
      console.error(
        "[1minAI] Error:",
        error.response ? error.response.data : error.message
      );
      throw new Error("1minAI Provider Failed");
    }
  }
}

module.exports = OneMinProvider;
