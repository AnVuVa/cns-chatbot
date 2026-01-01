const express = require('express');
const cors = require('cors');
const { requestLoggerMiddleware, logger } = require('./utils/logger');
const chatRoutes = require('./routes/chat.routes');
const messengerRoutes = require('./routes/messenger.routes');
const statsRoutes = require('./routes/stats.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware - logs all HTTP requests
app.use(requestLoggerMiddleware);

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/stats', statsRoutes);
app.use('/webhook', messengerRoutes);

// Health check
app.get('/', (req, res) => res.send('Enterprise Chatbot API is running'));

// Log app startup
logger.info('App', 'Express app initialized');

module.exports = app;