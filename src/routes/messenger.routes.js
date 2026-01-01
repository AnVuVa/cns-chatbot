const express = require('express');
const router = express.Router();
const messengerService = require('../services/messenger.service');

/**
 * GET /webhook/messenger
 * Webhook verification endpoint for Facebook
 * Facebook sends a GET request with hub.mode, hub.verify_token, hub.challenge
 */
router.get('/messenger', (req, res) => {
    console.log('[Messenger] Verification request received');
    console.log('[Messenger] Query params:', req.query);

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.FB_VERIFY_TOKEN;

    console.log('[Messenger] Mode:', mode);
    console.log('[Messenger] Token received:', token);
    console.log('[Messenger] Token expected:', verifyToken);
    console.log('[Messenger] Challenge:', challenge);

    if (mode && token) {
        if (mode === 'subscribe' && token === verifyToken) {
            console.log('[Messenger] ✅ Webhook verified successfully');
            res.status(200).send(challenge);
        } else {
            console.warn('[Messenger] ❌ Webhook verification failed - token mismatch');
            console.warn(`[Messenger] Expected: "${verifyToken}", Got: "${token}"`);
            res.sendStatus(403);
        }
    } else {
        console.warn('[Messenger] ❌ Missing mode or token');
        res.sendStatus(400);
    }
});

/**
 * POST /webhook/messenger
 * Receives incoming messages from Facebook Messenger
 */
router.post('/messenger', async (req, res) => {
    const body = req.body;

    // Verify this is from a Page subscription
    if (body.object === 'page') {
        // Immediately return 200 to Facebook (required within 20 seconds)
        res.status(200).send('EVENT_RECEIVED');

        // Process each entry (batched events)
        for (const entry of body.entry) {
            const webhookEvent = entry.messaging?.[0];

            if (webhookEvent) {
                await messengerService.handleWebhookEvent(webhookEvent);
            }
        }
    } else {
        res.sendStatus(404);
    }
});

module.exports = router;
