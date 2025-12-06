const app = require('./app');
const http = require('http');
const { Server } = require("socket.io");
const chatService = require('./services/chat.service');
require('dotenv').config();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Real-time integration (SAD Mục 3 & 7)
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', (sessionId) => {
    socket.join(sessionId);
  });

  socket.on('send_message', async (data) => {
    // data: { userId, sessionId, question }
    const { userId, sessionId, question } = data;
    
    // Gọi service xử lý
    const answer = await chatService.processMessage(userId, sessionId, question);
    
    // Emit lại cho client
    io.to(sessionId).emit('receive_message', {
        answer: answer,
        timestamp: new Date()
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});