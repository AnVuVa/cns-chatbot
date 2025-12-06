const supabase = require('../config/supabase');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Cấu hình thông tin liên hệ
const CONTACT_INFO = `
Nếu vấn đề chưa được giải quyết, vui lòng liên hệ trực tiếp:
- Hotline: 1900 1234 (Nhánh 1)
- Email: support@enterprise.com
- Giờ làm việc: 08:00 - 17:30 (Thứ 2 - Thứ 6)
`;

// Khởi tạo Gemini cho Embedding
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class RagService {
    constructor() {
        this.embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    }

    // 1. Tạo Embedding
    async createEmbedding(text) {
        try {
            const result = await this.embeddingModel.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            console.error("Embedding Error:", error);
            throw error;
        }
    }

    // 2. Tìm kiếm thông tin (Core Logic)
    async searchKnowledgeBase(question, threshold = 0.5) {
        const embedding = await this.createEmbedding(question);

        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: threshold, // Chỉ lấy các đoạn văn bản có liên quan cao
            match_count: 3
        });

        if (error) throw error;

        return documents || [];
    }

    // 3. Trả về thông tin fallback
    getFallbackResponse() {
        return `Xin lỗi, tôi không tìm thấy thông tin liên quan trong hệ thống tri thức nội bộ.\n\n${CONTACT_INFO}`;
    }

    // Helper: Gom nội dung các documents thành 1 đoạn context text
    formatContext(documents) {
        if (!documents || documents.length === 0) return "";
        return documents.map(doc => `- ${doc.content}`).join("\n");
    }
}

module.exports = new RagService();