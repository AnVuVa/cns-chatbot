# AGENTS.md

Guidelines for AI agents working on this codebase.

## Project Overview

CNS Chatbot API - Enterprise chatbot with:
- **3-Layer Funnel**: Cache → RAG → LLM
- **Multi-Provider AI**: Mistral, Gemini, 1min.ai
- **Conversation Memory**: 30-minute sessions
- **Facebook Messenger Integration**

## Architecture

```
src/
├── server.js          # Entry point, dotenv loaded here
├── app.js             # Express setup, routes
├── config/
│   ├── prompts.js     # Bot persona & prompts
│   ├── redis.js       # Upstash Redis client
│   └── supabase.js    # Supabase client
├── providers/
│   ├── mistral.provider.js   # Primary LLM
│   ├── gemini.provider.js    # Fallback LLM
│   └── onemin.provider.js    # Gateway LLM
├── services/
│   ├── chat.service.js       # Core pipeline + memory
│   ├── rag.service.js        # Vector search
│   └── messenger.service.js  # FB Messenger logic
├── adapters/
│   └── messenger.adapter.js  # FB Send API
├── routes/
│   ├── chat.routes.js
│   ├── messenger.routes.js
│   └── stats.routes.js
└── utils/
    └── logger.js      # File-based logging
```

## Key Files

| File | Purpose |
|------|---------|
| `chat.service.js` | Main pipeline: cache → RAG → LLM, conversation memory |
| `prompts.js` | Bot persona, edit to change behavior |
| `mistral.provider.js` | Primary AI calls |
| `.env` | API keys, provider config |

## Environment Variables

```env
LLM_PROVIDER=mistral|gemini|onemin
LLM_FALLBACK_PROVIDER=gemini
EMBEDDING_PROVIDER=gemini|mistral
MISTRAL_API_KEY=...
GEMINI_API_KEY=...
```

## Common Tasks

### Change Bot Persona
Edit `src/config/prompts.js` → `getChatPrompt()` function.

### Switch LLM Provider
Update `.env`:
```env
LLM_PROVIDER=gemini  # or mistral, onemin
```

### Add Knowledge Base
1. Add files to `knowledge_data/`
2. Run `npm run ingest`

### Debug Issues
Check logs in `logs/` directory:
- `llm_*.log` - LLM calls, errors
- `system_log_*.log` - Performance timing
- `request_*.log` - HTTP requests

## Database Tables

| Table | Purpose |
|-------|---------|
| `knowledge_base` | RAG documents + embeddings |
| `chat_logs` | All chat interactions |
| `chat_sessions` | Session management |
| `messenger_logs` | FB Messenger specific |
| `conversation_archive` | Expired sessions (for training) |

## Testing

```bash
# Start server
npm run dev

# Test chat API
curl -X POST http://localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "question": "Hello"}'
```

## Notes

- Server must restart to pick up `.env` changes
- Mistral requires billing activated at console.mistral.ai
- Conversation memory stored in-memory (Map), not persistent
