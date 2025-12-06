const { GoogleGenerativeAI } = require("@google/generative-ai");
const IAIProvider = require('./ai.interface');

class GeminiProvider extends IAIProvider {
  constructor() {
    super();
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  async generateResponse(prompt, context) {
    const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const fullPrompt = `Context: ${context}\n\nQuestion: ${prompt}`;
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  }
}
module.exports = GeminiProvider;