/**
 * RAG System Types for SalesFlow AI 2.0
 * Based on Lawer RAG with sales-specific extensions
 */

// ============================================================================
// CORE RAG TYPES
// ============================================================================

export interface RAGDocument {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  
  // Document metadata
  documentType: DocumentType;
  salesCategory?: SalesCategory;
  language: string;
  
  // Vector data
  embedding?: number[];
  embeddingModel: string;
  
  // Processing status
  processed: boolean;
  vectorized: boolean;
  indexed: boolean;
  
  // Sales-specific metadata
  salesMetadata?: SalesDocumentMetadata;
  
  // File information
  sourceType: 'upload' | 'url' | 'api' | 'manual';
  sourceUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastAccessed?: Date;
}

export type DocumentType = 
  | 'knowledge_base'
  | 'faq'
  | 'manual'
  | 'policy'
  | 'training_material'
  | 'sales_script'
  | 'product_catalog'
  | 'competitor_analysis'
  | 'case_study'
  | 'objection_handling';

export type SalesCategory = 
  | 'product_info'
  | 'pricing'
  | 'features_benefits'
  | 'competitor_comparison'
  | 'objection_responses'
  | 'sales_process'
  | 'customer_stories'
  | 'technical_specs'
  | 'compliance_legal'
  | 'training_materials';

export interface SalesDocumentMetadata {
  // Product information
  productIds?: string[];
  productCategories?: string[];
  priceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  
  // Sales context
  salesStages?: string[];
  customerSegments?: string[];
  industry?: string;
  useCase?: string;
  
  // Competitor data
  competitorMentions?: string[];
  comparisonType?: 'feature' | 'price' | 'service' | 'general';
  
  // Engagement metrics
  usage: {
    accessCount: number;
    lastUsed?: Date;
    effectivenessScore?: number;
  };
  
  // Content quality
  accuracy: {
    isVerified: boolean;
    verifiedBy?: string;
    verifiedAt?: Date;
    confidenceScore: number;
  };
}

// ============================================================================
// RAG SEARCH TYPES
// ============================================================================

export interface RAGSearchRequest {
  query: string;
  tenantId: string;
  
  // Search parameters
  limit?: number;
  threshold?: number;
  
  // Context filters
  documentTypes?: DocumentType[];
  salesCategories?: SalesCategory[];
  
  // Sales-specific context
  salesContext?: SalesSearchContext;
  
  // Advanced options
  includeMetadata?: boolean;
  rerankResults?: boolean;
  useHybridSearch?: boolean;
}

export interface SalesSearchContext {
  // Customer context
  customerId?: string;
  customerSegment?: string;
  customerIndustry?: string;
  
  // Sales context
  salesStage?: string;
  dealValue?: number;
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
  
  // Product context
  productIds?: string[];
  productCategories?: string[];
  
  // Conversation context
  conversationId?: string;
  previousQueries?: string[];
  emotionalState?: 'positive' | 'negative' | 'neutral' | 'frustrated';
  
  // Competitor context
  mentionedCompetitors?: string[];
  comparisonNeeded?: boolean;
}

export interface RAGSearchResult {
  document: RAGDocument;
  relevanceScore: number;
  contextScore?: number;
  salesRelevanceScore?: number;
  
  // Matched content
  matchedContent: string;
  highlightedText?: string;
  matchedSections?: ContentSection[];
  
  // Metadata
  searchMetadata: {
    searchType: 'semantic' | 'keyword' | 'hybrid';
    processingTime: number;
    embeddingDistance?: number;
    rerankingScore?: number;
  };
}

export interface ContentSection {
  sectionTitle?: string;
  content: string;
  startPosition: number;
  endPosition: number;
  sectionType?: 'introduction' | 'main_content' | 'example' | 'conclusion';
  relevanceScore: number;
}

// ============================================================================
// RAG GENERATION TYPES
// ============================================================================

export interface RAGGenerationRequest {
  query: string;
  searchResults: RAGSearchResult[];
  tenantId: string;
  
  // Generation parameters
  maxTokens?: number;
  temperature?: number;
  
  // Sales context for generation
  salesContext?: SalesGenerationContext;
  
  // Response formatting
  responseFormat?: 'text' | 'structured' | 'bullets' | 'table';
  includeReferences?: boolean;
  includeSuggestions?: boolean;
}

export interface SalesGenerationContext {
  // Customer information
  customerName?: string;
  customerRole?: string;
  customerCompany?: string;
  
  // Sales representative context
  salesRepName?: string;
  salesRepRole?: string;
  
  // Conversation tone
  communicationStyle?: 'formal' | 'casual' | 'technical' | 'friendly';
  responseType?: 'answer' | 'proposal' | 'objection_handling' | 'follow_up';
  
  // Business context
  dealContext?: {
    dealValue?: number;
    timeline?: string;
    decisionMakers?: string[];
    competitorsInvolved?: string[];
  };
}

export interface RAGGenerationResult {
  answer: string;
  confidence: number;
  
  // Sources and references
  usedSources: {
    documentId: string;
    title: string;
    relevanceScore: number;
    contentSnippet: string;
  }[];
  
  // Sales-specific additions
  salesInsights?: {
    suggestedNextSteps?: string[];
    potentialObjections?: string[];
    competitorMentions?: string[];
    upsellOpportunities?: string[];
  };
  
  // Generation metadata
  generationMetadata: {
    model: string;
    tokensUsed: number;
    processingTime: number;
    sourcesConsidered: number;
    sourcesUsed: number;
  };
  
  // Quality metrics
  qualityMetrics?: {
    factualAccuracy?: number;
    relevance?: number;
    completeness?: number;
    salesValue?: number;
  };
}

// ============================================================================
// DOCUMENT PROCESSING TYPES
// ============================================================================

export interface DocumentProcessingRequest {
  tenantId: string;
  
  // Source information
  source: DocumentSource;
  
  // Processing options
  options: ProcessingOptions;
  
  // Sales-specific metadata
  salesMetadata?: Partial<SalesDocumentMetadata>;
}

export interface DocumentSource {
  type: 'file' | 'url' | 'text' | 'api';
  
  // File upload
  file?: {
    buffer: Buffer;
    filename: string;
    mimetype: string;
  };
  
  // URL source
  url?: string;
  
  // Direct text
  text?: string;
  title?: string;
  
  // API source
  apiSource?: {
    provider: string;
    resourceId: string;
    credentials?: Record<string, any>;
  };
}

export interface ProcessingOptions {
  // Text processing
  extractText: boolean;
  extractImages: boolean;
  extractTables: boolean;
  
  // Chunking strategy
  chunkStrategy: 'sentence' | 'paragraph' | 'section' | 'fixed_size' | 'semantic';
  chunkSize?: number;
  chunkOverlap?: number;
  
  // Vectorization
  embeddingModel: string;
  generateEmbeddings: boolean;
  
  // Sales-specific processing
  extractProductInfo?: boolean;
  extractPricing?: boolean;
  extractCompetitorMentions?: boolean;
  detectSalesStages?: boolean;
  
  // Quality control
  validateContent?: boolean;
  checkDuplicates?: boolean;
  enableAutoTagging?: boolean;
}

export interface DocumentProcessingResult {
  success: boolean;
  documentId?: string;
  
  // Processing results
  extractedText?: string;
  chunks?: DocumentChunk[];
  embeddings?: number[][];
  
  // Sales-specific extractions
  extractedInfo?: {
    products?: ExtractedProduct[];
    pricing?: ExtractedPricing[];
    competitors?: ExtractedCompetitor[];
    salesStages?: string[];
  };
  
  // Processing metadata
  processingMetadata: {
    processingTime: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    tokensProcessed: number;
    errors?: string[];
    warnings?: string[];
  };
}

export interface DocumentChunk {
  id: string;
  content: string;
  embedding?: number[];
  
  // Position in document
  startPosition: number;
  endPosition: number;
  chunkIndex: number;
  
  // Metadata
  metadata: {
    section?: string;
    subsection?: string;
    pageNumber?: number;
    chunkType: 'text' | 'table' | 'list' | 'heading';
  };
  
  // Sales-specific metadata
  salesMetadata?: {
    containsProductInfo?: boolean;
    containsPricing?: boolean;
    containsCompetitorInfo?: boolean;
    salesRelevanceScore?: number;
  };
}

export interface ExtractedProduct {
  name: string;
  id?: string;
  category?: string;
  description?: string;
  features?: string[];
  specifications?: Record<string, any>;
  confidence: number;
}

export interface ExtractedPricing {
  product?: string;
  price?: number;
  currency?: string;
  priceType?: 'fixed' | 'starting_from' | 'up_to' | 'range';
  priceRange?: { min: number; max: number };
  conditions?: string;
  confidence: number;
}

export interface ExtractedCompetitor {
  name: string;
  mentionContext: string;
  comparisonType?: 'feature' | 'price' | 'service' | 'general';
  sentiment?: 'positive' | 'negative' | 'neutral';
  confidence: number;
}

// ============================================================================
// VECTOR DATABASE TYPES
// ============================================================================

export interface VectorSearchRequest {
  embedding: number[];
  tenantId: string;
  
  // Search parameters
  limit?: number;
  threshold?: number;
  
  // Filters
  filters?: VectorSearchFilters;
  
  // Search options
  options?: {
    includeMetadata?: boolean;
    includeEmbedding?: boolean;
    rerankResults?: boolean;
  };
}

export interface VectorSearchFilters {
  documentTypes?: DocumentType[];
  salesCategories?: SalesCategory[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  salesMetadata?: {
    productIds?: string[];
    salesStages?: string[];
    customerSegments?: string[];
  };
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
  embedding?: number[];
}

// ============================================================================
// RAG CONFIGURATION TYPES
// ============================================================================

export interface RAGConfig {
  // Models configuration
  embeddingModel: {
    provider: 'openai' | 'huggingface' | 'custom';
    model: string;
    dimensions: number;
    maxTokens: number;
  };
  
  generationModel: {
    provider: 'openai' | 'anthropic' | 'yandex';
    model: string;
    maxTokens: number;
    temperature: number;
  };
  
  // Search configuration
  search: {
    defaultLimit: number;
    maxLimit: number;
    defaultThreshold: number;
    useHybridSearch: boolean;
    rerankingEnabled: boolean;
  };
  
  // Processing configuration
  processing: {
    defaultChunkSize: number;
    defaultChunkOverlap: number;
    maxDocumentSize: number;
    enableParallelProcessing: boolean;
  };
  
  // Sales-specific configuration
  salesFeatures: {
    enableProductExtraction: boolean;
    enablePricingExtraction: boolean;
    enableCompetitorDetection: boolean;
    enableSalesStageDetection: boolean;
    enableContextualReranking: boolean;
  };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class RAGError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'RAGError';
  }
}

export class DocumentProcessingError extends RAGError {
  constructor(
    message: string,
    public processingStage: string,
    statusCode: number = 422
  ) {
    super(message, 'DOCUMENT_PROCESSING_ERROR', statusCode);
  }
}

export class VectorSearchError extends RAGError {
  constructor(
    message: string,
    statusCode: number = 500
  ) {
    super(message, 'VECTOR_SEARCH_ERROR', statusCode);
  }
}

export class GenerationError extends RAGError {
  constructor(
    message: string,
    public model: string,
    statusCode: number = 500
  ) {
    super(message, 'GENERATION_ERROR', statusCode);
  }
}