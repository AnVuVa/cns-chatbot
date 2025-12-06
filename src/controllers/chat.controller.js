const chatService = require('../services/chat.service');
const supabase = require('../config/supabase');

exports.sendMessage = async (req, res) => {
    const { userId, question } = req.body;
    let { sessionId } = req.body;

    if (!sessionId) {
        // Tạo session mới nếu chưa có
        const { data, error } = await supabase
            .from('chat_sessions')
            .insert({ user_id: userId, metadata: req.headers })
            .select()
            .single();
        sessionId = data.id;
    }

    // Xử lý tin nhắn
    const answer = await chatService.processMessage(userId, sessionId, question);

    res.json({
        sessionId,
        answer
    });
};