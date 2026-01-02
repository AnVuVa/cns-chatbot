require('dotenv').config();
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- CONFIG ---
const SOURCE_DIR = './knowledge_data'; // Thư mục chứa tài liệu
const CHUNK_SIZE = 1500; // Ký tự
const CHUNK_OVERLAP = 200; // Ký tự
const BATCH_SIZE = 10; // Xử lý 10 chunks cùng lúc để tránh rate limit

// --- INIT ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// --- UTILS ---

// 1. Hàm tạo Embedding (Gemini 768 dimensions)
async function generateEmbedding(text) {
    try {
        const result = await embeddingModel.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error("Embedding Error:", error.message);
        return null; // Trả về null để handle sau
    }
}

// 2. Hàm đọc nội dung file theo định dạng
async function extractTextFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    try {
        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            return data.text; // Có thể lấy data.numpages để lưu metadata nếu muốn
        }
        else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        }
        else if (ext === '.txt' || ext === '.md' || ext === '.json') {
            return fs.readFileSync(filePath, 'utf-8');
        }
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
    }
    return null;
}

// --- MAIN PROCESS ---

async function processKnowledgeBase() {
    console.log(`🚀 Bắt đầu quét thư mục: ${SOURCE_DIR}`);

    // Tìm tất cả file trong thư mục và thư mục con
    const files = glob.sync(`${SOURCE_DIR}/**/*.{txt,md,pdf,docx,json}`);
    console.log(`📦 Tìm thấy ${files.length} tài liệu.`);

    // Bộ cắt text thông minh
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
        separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""], // Ưu tiên cắt theo đoạn văn -> câu -> từ
    });

    for (const filePath of files) {
        const fileName = path.basename(filePath);
        console.log(`\n📄 Đang xử lý: ${fileName}`);

        // 1. Extract Text
        const rawText = await extractTextFromFile(filePath);
        if (!rawText || rawText.trim().length === 0) {
            console.log(`   ⚠️ File rỗng hoặc lỗi đọc. Bỏ qua.`);
            continue;
        }

        // 2. Cleaning (Xóa khoảng trắng thừa, ký tự lạ)
        const cleanText = rawText.replace(/\s+/g, ' ').trim();

        // 3. Chunking
        const chunks = await splitter.splitText(cleanText);
        console.log(`   ✂️ Chia thành ${chunks.length} đoạn nhỏ.`);

        // 4. Batch Insert (Xử lý từng cụm để tiết kiệm RAM và Network)
        let processedCount = 0;

        while (processedCount < chunks.length) {
            const batch = chunks.slice(processedCount, processedCount + BATCH_SIZE);
            const recordsToInsert = [];

            // Tạo embedding song song cho batch này
            const embeddingPromises = batch.map(async (chunkContent) => {
                const vector = await generateEmbedding(chunkContent);
                if (vector) {
                    return {
                        content: chunkContent,
                        embedding: vector,
                        source_type: path.extname(filePath).replace('.', ''), // 'pdf', 'docx'
                        metadata: {
                            filename: fileName,
                            path: filePath,
                            chunk_index: processedCount // Để truy vết thứ tự nếu cần
                        }
                    };
                }
            });

            const results = await Promise.all(embeddingPromises);
            // Lọc bỏ các embedding lỗi (null)
            const validRecords = results.filter(r => r !== undefined && r !== null);

            if (validRecords.length > 0) {
                const { error } = await supabase.from('knowledge_base').insert(validRecords);
                if (error) console.error("   ❌ Lỗi lưu DB:", error.message);
            }

            processedCount += batch.length;
            process.stdout.write(`   ...Đã lưu ${processedCount}/${chunks.length} đoạn\r`);
        }
        console.log(`   ✅ Hoàn tất file ${fileName}`);
    }

    console.log("\n🎉 TOÀN BỘ QUÁ TRÌNH NHẬP LIỆU HOÀN TẤT!");
}

processKnowledgeBase();