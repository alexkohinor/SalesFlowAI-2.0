/**
 * Default RAG Configuration for SalesFlow AI 2.0
 */

import { RAGConfig } from './types';

const defaultRAGConfig: RAGConfig = {
  // Embedding model configuration
  embeddingModel: {
    provider: 'openai',
    model: 'text-embedding-3-small', // More cost-effective for production
    dimensions: 1536,
    maxTokens: 8191
  },

  // Generation model configuration
  generationModel: {
    provider: 'openai',
    model: 'gpt-4o-mini', // More cost-effective than GPT-4
    maxTokens: 4096,
    temperature: 0.1 // Low temperature for consistent business responses
  },

  // Search configuration
  search: {
    defaultLimit: 5,
    maxLimit: 20,
    defaultThreshold: 0.7,
    useHybridSearch: true,
    rerankingEnabled: true
  },

  // Processing configuration
  processing: {
    defaultChunkSize: 1000,
    defaultChunkOverlap: 200,
    maxDocumentSize: 10 * 1024 * 1024, // 10MB
    enableParallelProcessing: true
  },

  // Sales-specific features
  salesFeatures: {
    enableProductExtraction: true,
    enablePricingExtraction: true,
    enableCompetitorDetection: true,
    enableSalesStageDetection: true,
    enableContextualReranking: true
  }
};

// Production configuration
export const productionRAGConfig: RAGConfig = {
  ...defaultRAGConfig,
  embeddingModel: {
    ...defaultRAGConfig.embeddingModel,
    model: 'text-embedding-3-large', // Higher quality for production
    dimensions: 3072
  },
  generationModel: {
    ...defaultRAGConfig.generationModel,
    model: 'gpt-4o', // Best quality for production
    maxTokens: 8192,
    temperature: 0.05
  },
  search: {
    ...defaultRAGConfig.search,
    defaultLimit: 8,
    useHybridSearch: true,
    rerankingEnabled: true
  }
};

// Development configuration
export const developmentRAGConfig: RAGConfig = {
  ...defaultRAGConfig,
  embeddingModel: {
    ...defaultRAGConfig.embeddingModel,
    model: 'text-embedding-3-small'
  },
  generationModel: {
    ...defaultRAGConfig.generationModel,
    model: 'gpt-4o-mini',
    temperature: 0.2
  },
  search: {
    ...defaultRAGConfig.search,
    defaultLimit: 3,
    rerankingEnabled: false // Disable for faster development
  },
  salesFeatures: {
    ...defaultRAGConfig.salesFeatures,
    enableProductExtraction: false, // Disable for faster processing in dev
    enableCompetitorDetection: false
  }
};

// Budget configuration for smaller businesses
export const budgetRAGConfig: RAGConfig = {
  ...defaultRAGConfig,
  embeddingModel: {
    ...defaultRAGConfig.embeddingModel,
    model: 'text-embedding-3-small',
    dimensions: 1536
  },
  generationModel: {
    ...defaultRAGConfig.generationModel,
    model: 'gpt-4o-mini',
    maxTokens: 2048,
    temperature: 0.1
  },
  search: {
    ...defaultRAGConfig.search,
    defaultLimit: 3,
    maxLimit: 10,
    rerankingEnabled: false
  }
};

// Enterprise configuration for large businesses
export const enterpriseRAGConfig: RAGConfig = {
  ...defaultRAGConfig,
  embeddingModel: {
    ...defaultRAGConfig.embeddingModel,
    model: 'text-embedding-3-large',
    dimensions: 3072
  },
  generationModel: {
    ...defaultRAGConfig.generationModel,
    model: 'gpt-4o',
    maxTokens: 16384,
    temperature: 0.05
  },
  search: {
    ...defaultRAGConfig.search,
    defaultLimit: 10,
    maxLimit: 50,
    useHybridSearch: true,
    rerankingEnabled: true
  },
  processing: {
    ...defaultRAGConfig.processing,
    defaultChunkSize: 1500,
    defaultChunkOverlap: 300,
    maxDocumentSize: 50 * 1024 * 1024, // 50MB for enterprise
    enableParallelProcessing: true
  }
};

export default defaultRAGConfig;