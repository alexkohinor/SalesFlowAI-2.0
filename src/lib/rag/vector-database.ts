/**
 * Vector Database Service for SalesFlow AI 2.0
 * Uses Supabase with pgvector for vector storage and similarity search
 */

import { createClient } from '@supabase/supabase-js';
import {
  VectorSearchRequest,
  VectorSearchResult,
  VectorSearchFilters,
  DocumentChunk,
  RAGConfig
} from './types';

export interface VectorIndexConfig {
  tableName: string;
  dimensions: number;
  indexType: 'ivfflat' | 'hnsw';
  indexParameters?: {
    lists?: number; // for ivfflat
    m?: number; // for hnsw
    efConstruction?: number; // for hnsw
  };
}

export interface VectorRecord {
  id: string;
  documentId: string;
  chunkId: string;
  tenantId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  createdAt: Date;
}

// ============================================================================
// VECTOR DATABASE CLASS
// ============================================================================

export class VectorDatabase {
  private supabase: any;
  private config: RAGConfig;
  private indexConfig: VectorIndexConfig;

  constructor(config: RAGConfig, supabaseClient?: any) {
    this.config = config;
    this.supabase = supabaseClient || createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.indexConfig = {
      tableName: 'knowledge_chunks',
      dimensions: config.embeddingModel.dimensions,
      indexType: 'hnsw', // HNSW is better for real-time search
      indexParameters: {
        m: 16,
        efConstruction: 64
      }
    };
  }

  /**
   * Initialize vector database tables and indexes
   */
  async initialize(): Promise<void> {
    try {
      // Create vector extension if not exists
      await this.supabase.rpc('create_vector_extension');

      // Create knowledge_chunks table if not exists
      await this.createChunksTable();

      // Create vector index for fast similarity search
      await this.createVectorIndex();

      // Create RLS policies for multi-tenancy
      await this.createRLSPolicies();

    } catch (error) {
      console.error('Failed to initialize vector database:', error);
      throw error;
    }
  }

  /**
   * Index document chunks with their embeddings
   */
  async indexChunks(documentId: string, chunks: DocumentChunk[]): Promise<void> {
    try {
      const vectorRecords = chunks.map(chunk => ({
        id: chunk.id,
        document_id: documentId,
        chunk_id: chunk.id,
        tenant_id: this.extractTenantFromDocumentId(documentId),
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: {
          ...chunk.metadata,
          salesMetadata: chunk.salesMetadata,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          chunkIndex: chunk.chunkIndex
        }
      }));

      const { error } = await this.supabase
        .from(this.indexConfig.tableName)
        .insert(vectorRecords);

      if (error) {
        throw new Error(`Failed to index chunks: ${error.message}`);
      }

    } catch (error) {
      throw new Error(`Chunk indexing failed: ${error.message}`);
    }
  }

  /**
   * Perform similarity search with filters
   */
  async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    try {
      let query = this.supabase
        .from(this.indexConfig.tableName)
        .select('id, document_id, chunk_id, content, metadata, embedding')
        .eq('tenant_id', request.tenantId);

      // Apply filters
      if (request.filters) {
        query = this.applyFilters(query, request.filters);
      }

      // Perform vector similarity search using pgvector
      const { data, error } = await query.rpc('match_chunks', {
        query_embedding: request.embedding,
        match_threshold: request.threshold || 0.7,
        match_count: request.limit || 10
      });

      if (error) {
        throw new Error(`Vector search failed: ${error.message}`);
      }

      // Convert to VectorSearchResult format
      const results: VectorSearchResult[] = data.map(row => ({
        id: row.chunk_id,
        score: row.similarity,
        metadata: {
          documentId: row.document_id,
          chunkId: row.chunk_id,
          content: row.content,
          ...row.metadata
        },
        embedding: request.options?.includeEmbedding ? row.embedding : undefined
      }));

      // Apply reranking if requested
      if (request.options?.rerankResults) {
        return await this.rerankResults(results, request);
      }

      return results;

    } catch (error) {
      throw new Error(`Vector search failed: ${error.message}`);
    }
  }

  /**
   * Delete all chunks for a document
   */
  async deleteDocument(documentId: string, tenantId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(this.indexConfig.tableName)
        .delete()
        .eq('document_id', documentId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new Error(`Failed to delete document chunks: ${error.message}`);
      }

    } catch (error) {
      throw new Error(`Document deletion failed: ${error.message}`);
    }
  }

  /**
   * Delete specific chunks
   */
  async deleteChunks(chunkIds: string[], tenantId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(this.indexConfig.tableName)
        .delete()
        .in('chunk_id', chunkIds)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new Error(`Failed to delete chunks: ${error.message}`);
      }

    } catch (error) {
      throw new Error(`Chunk deletion failed: ${error.message}`);
    }
  }

  /**
   * Update chunk embeddings
   */
  async updateChunkEmbeddings(
    chunkId: string,
    tenantId: string,
    embedding: number[]
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(this.indexConfig.tableName)
        .update({ embedding })
        .eq('chunk_id', chunkId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new Error(`Failed to update chunk embedding: ${error.message}`);
      }

    } catch (error) {
      throw new Error(`Embedding update failed: ${error.message}`);
    }
  }

  /**
   * Get chunk statistics for a tenant
   */
  async getChunkStatistics(tenantId: string): Promise<{
    totalChunks: number;
    totalDocuments: number;
    averageChunkSize: number;
    storageUsed: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_chunk_statistics', { tenant_id: tenantId });

      if (error) {
        throw new Error(`Failed to get statistics: ${error.message}`);
      }

      return data;

    } catch (error) {
      throw new Error(`Statistics retrieval failed: ${error.message}`);
    }
  }

  /**
   * Optimize vector index performance
   */
  async optimizeIndex(): Promise<void> {
    try {
      // VACUUM and ANALYZE the chunks table
      await this.supabase.rpc('optimize_vector_index', {
        table_name: this.indexConfig.tableName
      });

    } catch (error) {
      console.warn('Index optimization failed:', error);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async createChunksTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.indexConfig.tableName} (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        document_id UUID NOT NULL,
        chunk_id TEXT NOT NULL UNIQUE,
        tenant_id UUID NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${this.indexConfig.dimensions}),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_chunks_tenant_id ON ${this.indexConfig.tableName}(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON ${this.indexConfig.tableName}(document_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON ${this.indexConfig.tableName} USING GIN(metadata);

      -- Create trigger for updated_at
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_chunks_updated_at ON ${this.indexConfig.tableName};
      CREATE TRIGGER update_chunks_updated_at
        BEFORE UPDATE ON ${this.indexConfig.tableName}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    await this.supabase.rpc('execute_sql', { sql: createTableSQL });
  }

  private async createVectorIndex(): Promise<void> {
    let indexSQL = '';

    if (this.indexConfig.indexType === 'hnsw') {
      indexSQL = `
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw 
        ON ${this.indexConfig.tableName} 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = ${this.indexConfig.indexParameters?.m || 16}, ef_construction = ${this.indexConfig.indexParameters?.efConstruction || 64});
      `;
    } else {
      indexSQL = `
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding_ivfflat 
        ON ${this.indexConfig.tableName} 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = ${this.indexConfig.indexParameters?.lists || 100});
      `;
    }

    await this.supabase.rpc('execute_sql', { sql: indexSQL });

    // Create the match_chunks function
    const matchFunctionSQL = `
      CREATE OR REPLACE FUNCTION match_chunks(
        query_embedding vector(${this.indexConfig.dimensions}),
        match_threshold float DEFAULT 0.7,
        match_count int DEFAULT 10
      )
      RETURNS TABLE (
        chunk_id text,
        document_id uuid,
        content text,
        metadata jsonb,
        embedding vector(${this.indexConfig.dimensions}),
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          kc.chunk_id,
          kc.document_id,
          kc.content,
          kc.metadata,
          kc.embedding,
          1 - (kc.embedding <=> query_embedding) as similarity
        FROM ${this.indexConfig.tableName} kc
        WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
        ORDER BY similarity DESC
        LIMIT match_count;
      END;
      $$;
    `;

    await this.supabase.rpc('execute_sql', { sql: matchFunctionSQL });
  }

  private async createRLSPolicies(): Promise<void> {
    const rlsSQL = `
      -- Enable RLS
      ALTER TABLE ${this.indexConfig.tableName} ENABLE ROW LEVEL SECURITY;

      -- Create policy for tenant isolation
      DROP POLICY IF EXISTS "tenant_isolation_chunks" ON ${this.indexConfig.tableName};
      CREATE POLICY "tenant_isolation_chunks" ON ${this.indexConfig.tableName}
        FOR ALL USING (
          tenant_id = (current_setting('app.current_tenant_id', true))::uuid
        );

      -- Create statistics function
      CREATE OR REPLACE FUNCTION get_chunk_statistics(tenant_id uuid)
      RETURNS TABLE (
        total_chunks bigint,
        total_documents bigint,
        average_chunk_size numeric,
        storage_used bigint
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          COUNT(*)::bigint as total_chunks,
          COUNT(DISTINCT document_id)::bigint as total_documents,
          AVG(LENGTH(content))::numeric as average_chunk_size,
          SUM(LENGTH(content))::bigint as storage_used
        FROM ${this.indexConfig.tableName}
        WHERE ${this.indexConfig.tableName}.tenant_id = get_chunk_statistics.tenant_id;
      END;
      $$;

      -- Create optimization function
      CREATE OR REPLACE FUNCTION optimize_vector_index(table_name text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        EXECUTE format('VACUUM ANALYZE %I', table_name);
      END;
      $$;

      -- Create vector extension function
      CREATE OR REPLACE FUNCTION create_vector_extension()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        CREATE EXTENSION IF NOT EXISTS vector;
      END;
      $$;
    `;

    await this.supabase.rpc('execute_sql', { sql: rlsSQL });
  }

  private applyFilters(query: any, filters: VectorSearchFilters): any {
    // Document type filter
    if (filters.documentTypes?.length) {
      query = query.in('metadata->documentType', filters.documentTypes);
    }

    // Sales category filter
    if (filters.salesCategories?.length) {
      query = query.in('metadata->salesCategory', filters.salesCategories);
    }

    // Date range filter
    if (filters.dateRange) {
      query = query
        .gte('created_at', filters.dateRange.from.toISOString())
        .lte('created_at', filters.dateRange.to.toISOString());
    }

    // Sales metadata filters
    if (filters.salesMetadata) {
      if (filters.salesMetadata.productIds?.length) {
        query = query.overlaps('metadata->salesMetadata->productIds', filters.salesMetadata.productIds);
      }

      if (filters.salesMetadata.salesStages?.length) {
        query = query.overlaps('metadata->salesMetadata->salesStages', filters.salesMetadata.salesStages);
      }

      if (filters.salesMetadata.customerSegments?.length) {
        query = query.overlaps('metadata->salesMetadata->customerSegments', filters.salesMetadata.customerSegments);
      }
    }

    return query;
  }

  private async rerankResults(
    results: VectorSearchResult[],
    request: VectorSearchRequest
  ): Promise<VectorSearchResult[]> {
    // Simple reranking based on content length and metadata quality
    // TODO: Implement more sophisticated reranking (e.g., using cross-encoder)
    
    return results.map(result => {
      let rerankingScore = result.score;

      // Boost based on content quality
      const contentLength = result.metadata.content?.length || 0;
      if (contentLength > 100 && contentLength < 1000) {
        rerankingScore *= 1.1; // Prefer medium-length content
      }

      // Boost based on sales metadata presence
      if (result.metadata.salesMetadata) {
        rerankingScore *= 1.05;
      }

      // Store original score and new reranking score
      result.metadata.originalScore = result.score;
      result.metadata.rerankingScore = rerankingScore;
      result.score = rerankingScore;

      return result;
    }).sort((a, b) => b.score - a.score);
  }

  private extractTenantFromDocumentId(documentId: string): string {
    // TODO: Implement proper tenant extraction from document ID
    // For now, assuming it's passed in the context
    return 'default-tenant';
  }
}

export default VectorDatabase;