/**
 * RAG Manager for SalesFlow AI 2.0
 * Based on Lawer RAG architecture with sales-specific extensions
 */

import {
  RAGDocument,
  RAGSearchRequest,
  RAGSearchResult,
  RAGGenerationRequest,
  RAGGenerationResult,
  DocumentProcessingRequest,
  DocumentProcessingResult,
  SalesSearchContext,
  DocumentChunk,
  VectorSearchRequest,
  VectorSearchResult,
  RAGConfig,
  RAGError,
  DocumentProcessingError,
  VectorSearchError,
  GenerationError
} from './types';

import { EmbeddingService } from './embedding-service';
import { VectorDatabase } from './vector-database';
import { DocumentProcessor } from './document-processor';
import { GenerationService } from './generation-service';
import { S3Manager } from '@/lib/storage';

// ============================================================================
// RAG MANAGER CLASS
// ============================================================================

export class RAGManager {
  private supabase: any;
  private s3Manager: S3Manager;
  private embeddingService: EmbeddingService;
  private vectorDb: VectorDatabase;
  private documentProcessor: DocumentProcessor;
  private generationService: GenerationService;
  private config: RAGConfig;

  constructor(
    supabaseClient: any,
    s3Manager: S3Manager,
    config: RAGConfig
  ) {
    this.supabase = supabaseClient;
    this.s3Manager = s3Manager;
    this.config = config;
    
    // Initialize services
    this.embeddingService = new EmbeddingService(config.embeddingModel);
    this.vectorDb = new VectorDatabase(config);
    this.documentProcessor = new DocumentProcessor(config);
    this.generationService = new GenerationService(config.generationModel);
  }

  // ============================================================================
  // DOCUMENT MANAGEMENT
  // ============================================================================

  /**
   * Process and index a new document
   */
  async processDocument(request: DocumentProcessingRequest): Promise<DocumentProcessingResult> {
    try {
      // Extract and process document content
      const processingResult = await this.documentProcessor.process(request);
      
      if (!processingResult.success) {
        throw new DocumentProcessingError(
          'Failed to process document',
          'EXTRACTION_FAILED'
        );
      }

      // Generate embeddings for chunks
      const chunks = await this.generateChunkEmbeddings(
        processingResult.chunks!,
        request.tenantId
      );

      // Save document to database
      const document = await this.saveDocument({
        tenantId: request.tenantId,
        title: this.extractTitle(request),
        content: processingResult.extractedText!,
        documentType: this.inferDocumentType(request),
        salesCategory: request.salesMetadata?.industry ? 
          this.inferSalesCategory(processingResult.extractedText!) : undefined,
        language: 'ru', // TODO: detect language
        embeddingModel: this.config.embeddingModel.model,
        processed: true,
        vectorized: false,
        indexed: false,
        salesMetadata: request.salesMetadata,
        sourceType: request.source.type,
        sourceUrl: request.source.url,
        fileName: request.source.file?.filename,
        fileType: request.source.file?.mimetype,
        fileSize: request.source.file?.buffer.byteLength
      });

      // Store chunks in vector database
      await this.indexDocumentChunks(document.id, chunks);

      // Update document status
      await this.updateDocumentStatus(document.id, {
        vectorized: true,
        indexed: true
      });

      // Store file in S3 if applicable
      if (request.source.file) {
        await this.s3Manager.uploadFile({
          tenantId: request.tenantId,
          category: 'knowledge-base',
          fileName: `${document.id}_${request.source.file.filename}`,
          contentType: request.source.file.mimetype,
          buffer: request.source.file.buffer
        });
      }

      return {
        success: true,
        documentId: document.id,
        extractedText: processingResult.extractedText,
        chunks,
        embeddings: chunks.map(c => c.embedding!),
        extractedInfo: processingResult.extractedInfo,
        processingMetadata: processingResult.processingMetadata
      };

    } catch (error) {
      throw new DocumentProcessingError(
        `Document processing failed: ${error.message}`,
        'PROCESSING_FAILED'
      );
    }
  }

  /**
   * Delete document and all related data
   */
  async deleteDocument(documentId: string, tenantId: string): Promise<void> {
    try {
      // Remove from vector database
      await this.vectorDb.deleteDocument(documentId, tenantId);

      // Remove from main database
      const { error } = await this.supabase
        .from('knowledge_documents')
        .delete()
        .eq('id', documentId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new Error(error.message);
      }

      // Remove from S3 (best effort)
      try {
        const files = await this.s3Manager.listTenantFiles(tenantId, 'knowledge-base');
        const relatedFiles = files.filter(f => f.key.includes(documentId));
        
        for (const file of relatedFiles) {
          await this.s3Manager.deleteFile(file.key);
        }
      } catch (s3Error) {
        console.warn('Failed to delete S3 files:', s3Error);
      }

    } catch (error) {
      throw new RAGError(
        `Failed to delete document: ${error.message}`,
        'DOCUMENT_DELETE_FAILED'
      );
    }
  }

  /**
   * Get tenant documents with pagination
   */
  async getTenantDocuments(
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      documentTypes?: string[];
      salesCategories?: string[];
      searchQuery?: string;
    } = {}
  ): Promise<{ documents: RAGDocument[]; total: number }> {
    let query = this.supabase
      .from('knowledge_documents')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Apply filters
    if (options.documentTypes?.length) {
      query = query.in('document_type', options.documentTypes);
    }

    if (options.salesCategories?.length) {
      query = query.in('sales_category', options.salesCategories);
    }

    if (options.searchQuery) {
      query = query.or(`title.ilike.%${options.searchQuery}%,content.ilike.%${options.searchQuery}%`);
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error, count } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new RAGError('Failed to fetch documents', 'DOCUMENTS_FETCH_FAILED');
    }

    return {
      documents: data.map(this.mapDatabaseToDocument),
      total: count || 0
    };
  }

  // ============================================================================
  // SEARCH AND RETRIEVAL
  // ============================================================================

  /**
   * Search documents using semantic similarity and filters
   */
  async searchDocuments(request: RAGSearchRequest): Promise<RAGSearchResult[]> {
    try {
      // Generate embedding for search query
      const queryEmbedding = await this.embeddingService.generateEmbedding(request.query);

      // Prepare vector search with filters
      const vectorSearchRequest: VectorSearchRequest = {
        embedding: queryEmbedding,
        tenantId: request.tenantId,
        limit: request.limit || this.config.search.defaultLimit,
        threshold: request.threshold || this.config.search.defaultThreshold,
        filters: {
          documentTypes: request.documentTypes,
          salesCategories: request.salesCategories,
          salesMetadata: request.salesContext ? {
            productIds: request.salesContext.productIds,
            salesStages: request.salesContext.salesStage ? [request.salesContext.salesStage] : undefined,
            customerSegments: request.salesContext.customerSegment ? [request.salesContext.customerSegment] : undefined
          } : undefined
        },
        options: {
          includeMetadata: true,
          rerankResults: request.rerankResults ?? this.config.search.rerankingEnabled
        }
      };

      // Perform vector search
      const vectorResults = await this.vectorDb.search(vectorSearchRequest);

      // Convert to RAG search results
      const results: RAGSearchResult[] = [];

      for (const vectorResult of vectorResults) {
        // Get full document from database
        const document = await this.getDocument(vectorResult.metadata.documentId, request.tenantId);
        
        if (document) {
          // Calculate sales-specific relevance if context provided
          const salesRelevanceScore = request.salesContext ? 
            await this.calculateSalesRelevance(document, request.salesContext) : undefined;

          // Extract matched content around the chunk
          const matchedContent = await this.extractMatchedContent(
            document,
            vectorResult.metadata.chunkId,
            request.query
          );

          results.push({
            document,
            relevanceScore: vectorResult.score,
            salesRelevanceScore,
            contextScore: vectorResult.score, // TODO: implement context scoring
            matchedContent: matchedContent.content,
            highlightedText: matchedContent.highlighted,
            searchMetadata: {
              searchType: request.useHybridSearch ? 'hybrid' : 'semantic',
              processingTime: Date.now(), // TODO: implement proper timing
              embeddingDistance: 1 - vectorResult.score,
              rerankingScore: vectorResult.metadata.rerankingScore
            }
          });
        }
      }

      // Sort by combined relevance score
      results.sort((a, b) => {
        const scoreA = a.salesRelevanceScore ? 
          (a.relevanceScore + a.salesRelevanceScore) / 2 : a.relevanceScore;
        const scoreB = b.salesRelevanceScore ? 
          (b.relevanceScore + b.salesRelevanceScore) / 2 : b.relevanceScore;
        return scoreB - scoreA;
      });

      return results.slice(0, request.limit || this.config.search.defaultLimit);

    } catch (error) {
      throw new VectorSearchError(`Search failed: ${error.message}`);
    }
  }

  // ============================================================================
  // ANSWER GENERATION
  // ============================================================================

  /**
   * Generate answer using RAG with sales context
   */
  async generateAnswer(request: RAGGenerationRequest): Promise<RAGGenerationResult> {
    try {
      // Prepare context from search results
      const context = this.buildContext(request.searchResults);
      
      // Generate answer using LLM
      const generationResult = await this.generationService.generateAnswer({
        query: request.query,
        context,
        salesContext: request.salesContext,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        responseFormat: request.responseFormat
      });

      // Extract sales insights if enabled
      const salesInsights = await this.extractSalesInsights(
        request.query,
        generationResult.answer,
        request.searchResults,
        request.salesContext
      );

      // Build sources information
      const usedSources = request.searchResults.map(result => ({
        documentId: result.document.id,
        title: result.document.title,
        relevanceScore: result.relevanceScore,
        contentSnippet: result.matchedContent.substring(0, 200) + '...'
      }));

      return {
        answer: generationResult.answer,
        confidence: generationResult.confidence,
        usedSources,
        salesInsights,
        generationMetadata: generationResult.metadata,
        qualityMetrics: await this.assessAnswerQuality(
          request.query,
          generationResult.answer,
          request.searchResults
        )
      };

    } catch (error) {
      throw new GenerationError(
        `Answer generation failed: ${error.message}`,
        this.config.generationModel.model
      );
    }
  }

  /**
   * Generate contextual answer for sales conversation
   */
  async generateSalesAnswer(
    query: string,
    tenantId: string,
    salesContext: SalesSearchContext,
    options: {
      responseType?: 'answer' | 'proposal' | 'objection_handling' | 'follow_up';
      includeCompetitorInfo?: boolean;
      includePricingInfo?: boolean;
      maxResults?: number;
    } = {}
  ): Promise<RAGGenerationResult> {
    // Search for relevant documents with sales context
    const searchResults = await this.searchDocuments({
      query,
      tenantId,
      salesContext,
      limit: options.maxResults || 5,
      rerankResults: true
    });

    // Generate sales-optimized answer
    return await this.generateAnswer({
      query,
      searchResults,
      tenantId,
      salesContext: {
        customerName: salesContext.customerId, // Map to customer name if available
        responseType: options.responseType || 'answer',
        communicationStyle: this.inferCommunicationStyle(salesContext),
        dealContext: {
          dealValue: salesContext.dealValue,
          competitorsInvolved: salesContext.mentionedCompetitors
        }
      },
      includeReferences: true,
      includeSuggestions: true
    });
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async generateChunkEmbeddings(
    chunks: DocumentChunk[],
    tenantId: string
  ): Promise<DocumentChunk[]> {
    const embeddings = await this.embeddingService.generateBatchEmbeddings(
      chunks.map(chunk => chunk.content)
    );

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index]
    }));
  }

  private async saveDocument(documentData: Omit<RAGDocument, 'id' | 'createdAt' | 'updatedAt'>): Promise<RAGDocument> {
    const { data, error } = await this.supabase
      .from('knowledge_documents')
      .insert({
        title: documentData.title,
        content: documentData.content,
        document_type: documentData.documentType,
        sales_category: documentData.salesCategory,
        tenant_id: documentData.tenantId,
        processed: documentData.processed,
        vectorized: documentData.vectorized,
        file_name: documentData.fileName,
        file_type: documentData.fileType,
        file_size: documentData.fileSize,
        file_url: documentData.sourceUrl
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapDatabaseToDocument(data);
  }

  private async indexDocumentChunks(documentId: string, chunks: DocumentChunk[]): Promise<void> {
    await this.vectorDb.indexChunks(documentId, chunks);
  }

  private async updateDocumentStatus(
    documentId: string, 
    status: { vectorized?: boolean; indexed?: boolean }
  ): Promise<void> {
    const { error } = await this.supabase
      .from('knowledge_documents')
      .update(status)
      .eq('id', documentId);

    if (error) {
      throw new Error(error.message);
    }
  }

  private async getDocument(documentId: string, tenantId: string): Promise<RAGDocument | null> {
    const { data, error } = await this.supabase
      .from('knowledge_documents')
      .select('*')
      .eq('id', documentId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) return null;
    return this.mapDatabaseToDocument(data);
  }

  private async calculateSalesRelevance(
    document: RAGDocument,
    context: SalesSearchContext
  ): Promise<number> {
    let score = 0;
    
    // Product relevance
    if (context.productIds && document.salesMetadata?.productIds) {
      const overlap = context.productIds.filter(id => 
        document.salesMetadata?.productIds?.includes(id)
      ).length;
      score += (overlap / context.productIds.length) * 0.3;
    }

    // Sales stage relevance
    if (context.salesStage && document.salesMetadata?.salesStages?.includes(context.salesStage)) {
      score += 0.2;
    }

    // Customer segment relevance
    if (context.customerSegment && document.salesMetadata?.customerSegments?.includes(context.customerSegment)) {
      score += 0.2;
    }

    // Urgency boost
    if (context.urgencyLevel === 'critical') {
      score += 0.1;
    }

    // Usage frequency boost
    if (document.salesMetadata?.usage.accessCount > 10) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private async extractMatchedContent(
    document: RAGDocument,
    chunkId: string,
    query: string
  ): Promise<{ content: string; highlighted: string }> {
    // TODO: Implement content extraction and highlighting
    const content = document.content.substring(0, 500);
    const highlighted = content.replace(
      new RegExp(query, 'gi'),
      `<mark>$&</mark>`
    );

    return { content, highlighted };
  }

  private buildContext(searchResults: RAGSearchResult[]): string {
    return searchResults
      .slice(0, 5) // Limit context size
      .map(result => `Title: ${result.document.title}\nContent: ${result.matchedContent}`)
      .join('\n\n---\n\n');
  }

  private async extractSalesInsights(
    query: string,
    answer: string,
    searchResults: RAGSearchResult[],
    salesContext?: any
  ): Promise<any> {
    // TODO: Implement sales insights extraction
    return {
      suggestedNextSteps: ['Follow up with pricing information'],
      potentialObjections: ['Price concerns', 'Feature comparisons'],
      competitorMentions: [],
      upsellOpportunities: ['Premium package', 'Additional services']
    };
  }

  private async assessAnswerQuality(
    query: string,
    answer: string,
    searchResults: RAGSearchResult[]
  ): Promise<any> {
    // TODO: Implement quality assessment
    return {
      factualAccuracy: 0.9,
      relevance: 0.85,
      completeness: 0.8,
      salesValue: 0.75
    };
  }

  private extractTitle(request: DocumentProcessingRequest): string {
    if (request.source.title) return request.source.title;
    if (request.source.file?.filename) return request.source.file.filename;
    if (request.source.url) return new URL(request.source.url).pathname.split('/').pop() || 'Untitled';
    return 'Untitled Document';
  }

  private inferDocumentType(request: DocumentProcessingRequest): any {
    // TODO: Implement document type inference
    return 'knowledge_base';
  }

  private inferSalesCategory(content: string): any {
    // TODO: Implement sales category inference using NLP
    if (content.toLowerCase().includes('price') || content.toLowerCase().includes('cost')) {
      return 'pricing';
    }
    return 'product_info';
  }

  private inferCommunicationStyle(context: SalesSearchContext): any {
    // TODO: Implement communication style inference
    return 'professional';
  }

  private mapDatabaseToDocument(data: any): RAGDocument {
    return {
      id: data.id,
      tenantId: data.tenant_id,
      title: data.title,
      content: data.content,
      documentType: data.document_type,
      salesCategory: data.sales_category,
      language: 'ru',
      embeddingModel: 'text-embedding-ada-002',
      processed: data.processed,
      vectorized: data.vectorized,
      indexed: data.vectorized,
      sourceType: 'upload',
      fileName: data.file_name,
      fileType: data.file_type,
      fileSize: data.file_size,
      sourceUrl: data.file_url,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }
}

export default RAGManager;