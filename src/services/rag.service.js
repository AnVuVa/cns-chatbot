const supabase = require('../config/supabase');
const { RAG_FALLBACK_RESPONSE } = require('../config/prompts');
const { logger } = require('../utils/logger');

// Dynamic import of embedding providers
const GeminiProvider = require('../providers/gemini.provider');
const MistralProvider = require('../providers/mistral.provider');

// Get embedding provider from env, default to 'gemini'
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'gemini';

class RagService {
    constructor() {
        // Initialize the selected embedding provider
        this.provider = null;
        this.initProvider();
    }

    initProvider() {
        switch (EMBEDDING_PROVIDER) {
            case 'mistral':
                this.provider = new MistralProvider();
                logger.info('RAGService', 'Using Mistral embeddings (1024 dimensions)');
                break;
            case 'gemini':
            default:
                this.provider = new GeminiProvider();
                logger.info('RAGService', 'Using Gemini embeddings (768 dimensions)');
                break;
        }
    }

    /**
     * Create embedding using configured provider
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} - Embedding vector
     */
    async createEmbedding(text) {
        try {
            return await this.provider.generateEmbedding(text);
        } catch (error) {
            logger.error('RAGService', 'Embedding Error', { error: error.message });
            throw error;
        }
    }

    /**
     * Search knowledge base using vector similarity
     * @param {string} question - User question
     * @param {number} threshold - Similarity threshold (0-1)
     * @returns {Promise<Array>} - Matching documents
     */
    async searchKnowledgeBase(question, threshold = 0.5) {
        const embedding = await this.createEmbedding(question);

        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: threshold,
            match_count: 3
        });

        if (error) {
            logger.error('RAGService', 'Search Error', { error: error.message });
            throw error;
        }

        return documents || [];
    }

    /**
     * Get fallback response when no documents found
     * @returns {string}
     */
    getFallbackResponse() {
        return RAG_FALLBACK_RESPONSE;
    }

    /**
     * Format documents into context string
     * @param {Array} documents - Retrieved documents
     * @returns {string}
     */
    formatContext(documents) {
        if (!documents || documents.length === 0) return "";
        return documents.map(doc => `- ${doc.content}`).join("\n");
    }
}

module.exports = new RagService();