const express = require('express');
const router = express.Router();
const messengerService = require('../services/messenger.service');
const supabase = require('../config/supabase');

/**
 * GET /api/stats/messenger
 * Get Messenger usage statistics
 */
router.get('/messenger', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const stats = await messengerService.getStatistics({
            startDate: start_date,
            endDate: end_date
        });

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('[Stats] Error getting Messenger stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/stats/overview
 * Get overall chatbot statistics
 */
router.get('/overview', async (req, res) => {
    try {
        // Get chat logs count
        const { count: totalChats, error: chatError } = await supabase
            .from('chat_logs')
            .select('*', { count: 'exact', head: true });

        if (chatError) throw chatError;

        // Get messenger logs count
        const { count: messengerChats, error: msgError } = await supabase
            .from('messenger_logs')
            .select('*', { count: 'exact', head: true });

        // Get layer distribution
        const { data: layerData, error: layerError } = await supabase
            .from('chat_logs')
            .select('handled_by_layer');

        if (layerError) throw layerError;

        const layerDistribution = (layerData || []).reduce((acc, row) => {
            const layer = row.handled_by_layer || 'unknown';
            acc[`layer_${layer}`] = (acc[`layer_${layer}`] || 0) + 1;
            return acc;
        }, {});

        // Get provider distribution
        const { data: providerData, error: providerError } = await supabase
            .from('chat_logs')
            .select('provider');

        if (providerError) throw providerError;

        const providerDistribution = (providerData || []).reduce((acc, row) => {
            const provider = row.provider || 'unknown';
            acc[provider] = (acc[provider] || 0) + 1;
            return acc;
        }, {});

        res.json({
            success: true,
            data: {
                totalChats: totalChats || 0,
                messengerChats: messengerChats || 0,
                layerDistribution,
                providerDistribution
            }
        });
    } catch (error) {
        console.error('[Stats] Error getting overview stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/stats/recent
 * Get recent chat logs
 */
router.get('/recent', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        const { data, error } = await supabase
            .from('chat_logs')
            .select('id, user_question, bot_response, provider, latency_ms, handled_by_layer, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('[Stats] Error getting recent logs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
