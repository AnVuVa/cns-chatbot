const express = require('express');
const cors = require('cors');
const chatRoutes = require('./routes/chat.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => res.send('Enterprise Chatbot API is running'));

module.exports = app;