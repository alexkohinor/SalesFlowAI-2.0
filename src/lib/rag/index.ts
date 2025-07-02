/**
 * RAG System for SalesFlow AI 2.0
 * Complete Retrieval-Augmented Generation system with sales optimization
 */

// Export main classes
export { RAGManager } from './rag-manager';
export { EmbeddingService } from './embedding-service';
export { VectorDatabase } from './vector-database';
export { DocumentProcessor } from './document-processor';
export { GenerationService } from './generation-service';

// Export all types
export * from './types';

// Export default configuration
export { default as defaultRAGConfig } from './config';

// Re-export commonly used interfaces
export type {
  RAGDocument,
  RAGSearchRequest,
  RAGSearchResult,
  RAGGenerationRequest,
  RAGGenerationResult,
  DocumentProcessingRequest,
  DocumentProcessingResult,
  SalesSearchContext,
  DocumentType,
  SalesCategory
} from './types';