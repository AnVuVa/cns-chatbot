// Script chạy offline để phân tích log và tạo draft FAQ
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runSelfLearning() {
    console.log("Starting Self-Learning Process...");

    // 1. Extract: Lấy log layer 3 (tốn tiền AI) trong 24h qua
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: logs, error } = await supabase
        .from('chat_logs')
        .select('user_question')
        .eq('handled_by_layer', 3)
        .eq('processed_for_learning', false)
        .gte('created_at', oneDayAgo);

    if (error || !logs || logs.length === 0) {
        console.log("No data to process.");
        return;
    }

    console.log(`Processing ${logs.length} records...`);

    // 2. Process: Gom nhóm đơn giản (Trong thực tế sẽ dùng NLP Libraries như natural hoặc python scikit-learn)
    // Ở đây ta mô phỏng việc gom nhóm bằng cách đếm chuỗi trùng lặp chính xác hoặc chứa từ khóa
    const frequencyMap = {};
    
    logs.forEach(log => {
        const q = log.user_question.toLowerCase().trim();
        if (frequencyMap[q]) {
            frequencyMap[q]++;
        } else {
            frequencyMap[q] = 1;
        }
    });

    // 3. Load: Ghi vào bảng faq_drafts nếu tần suất >= 3
    const drafts = [];
    for (const [question, count] of Object.entries(frequencyMap)) {
        if (count >= 3) {
            drafts.push({
                question_group: question,
                frequency: count,
                status: 'pending'
            });
        }
    }

    if (drafts.length > 0) {
        await supabase.from('faq_drafts').insert(drafts);
        console.log(`Inserted ${drafts.length} new insights into FAQ Drafts.`);
        
        // Đánh dấu log đã xử lý
        // (Lưu ý: Cần xử lý batch update ID thực tế)
    }

    console.log("Job completed.");
}

runSelfLearning();