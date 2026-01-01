require('dotenv').config();
const app = require('./app');
const http = require('http');
const { Server } = require("socket.io");
const chatService = require('./services/chat.service');
const { logger } = require('./utils/logger');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Real-time integration (SAD Mục 3 & 7)
io.on('connection', (socket) => {
  logger.info('WebSocket', `User connected: ${socket.id}`);

  socket.on('join_room', (sessionId) => {
    socket.join(sessionId);
    logger.info('WebSocket', `User joined room: ${sessionId}`);
  });

  socket.on('send_message', async (data) => {
    // data: { userId, sessionId, question }
    const { userId, sessionId, question } = data;

    logger.info('WebSocket', 'Message received', { userId, sessionId, question: question?.substring(0, 100) });

    // Gọi service xử lý
    const answer = await chatService.processMessage(userId, sessionId, question);

    // Emit lại cho client
    io.to(sessionId).emit('receive_message', {
      answer: answer,
      timestamp: new Date()
    });
  });

  socket.on('disconnect', () => {
    logger.info('WebSocket', `User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info('Server', `🚀 Server running on port ${PORT}`);
  logger.info('Server', `Environment: ${process.env.NODE_ENV || 'development'}`);
});