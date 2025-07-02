/**
 * Embedding Service for SalesFlow AI 2.0
 * Handles text embeddings with support for multiple providers
 */

import OpenAI from 'openai';

export interface EmbeddingModelConfig {
  provider: 'openai' | 'huggingface' | 'custom';
  model: string;
  dimensions: number;
  maxTokens: number;
}

export interface EmbeddingRequest {
  text: string;
  model?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  tokens: number;
  model: string;
}

export interface BatchEmbeddingRequest {
  texts: string[];
  model?: string;
  batchSize?: number;
}

export interface BatchEmbeddingResponse {
  embeddings: number[][];
  totalTokens: number;
  model: string;
  processingTime: number;
}

// ============================================================================
// EMBEDDING SERVICE CLASS
// ============================================================================

export class EmbeddingService {
  private openai: OpenAI;
  private config: EmbeddingModelConfig;

  constructor(config: EmbeddingModelConfig) {
    this.config = config;
    
    if (config.provider === 'openai') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.generateEmbeddings([text]);
      return response.embeddings[0];
    } catch (error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(
    texts: string[],
    options: { batchSize?: number } = {}
  ): Promise<number[][]> {
    try {
      const response = await this.generateEmbeddings(texts, options.batchSize);
      return response.embeddings;
    } catch (error) {
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
  }

  /**
   * Generate embeddings with detailed response
   */
  async generateEmbeddings(
    texts: string[],
    batchSize: number = 100
  ): Promise<BatchEmbeddingResponse> {
    const startTime = Date.now();
    let totalTokens = 0;
    const allEmbeddings: number[][] = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResponse = await this.processBatch(batch);
      
      allEmbeddings.push(...batchResponse.embeddings);
      totalTokens += batchResponse.totalTokens;

      // Add delay between batches to respect rate limits
      if (i + batchSize < texts.length) {
        await this.delay(100); // 100ms delay
      }
    }

    return {
      embeddings: allEmbeddings,
      totalTokens,
      model: this.config.model,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Calculate similarity between two embeddings
   */
  calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return similarity;
  }

  /**
   * Find most similar embeddings from a list
   */
  findMostSimilar(
    queryEmbedding: number[],
    candidateEmbeddings: { id: string; embedding: number[] }[],
    limit: number = 10,
    threshold: number = 0.7
  ): { id: string; similarity: number }[] {
    const similarities = candidateEmbeddings
      .map(candidate => ({
        id: candidate.id,
        similarity: this.calculateCosineSimilarity(queryEmbedding, candidate.embedding)
      }))
      .filter(result => result.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return similarities;
  }

  /**
   * Validate embedding format and dimensions
   */
  validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding)) {
      return false;
    }

    if (embedding.length !== this.config.dimensions) {
      return false;
    }

    return embedding.every(value => typeof value === 'number' && !isNaN(value));
  }

  /**
   * Normalize embedding vector
   */
  normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(
      embedding.reduce((sum, value) => sum + value * value, 0)
    );

    if (magnitude === 0) {
      return embedding;
    }

    return embedding.map(value => value / magnitude);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async processBatch(texts: string[]): Promise<{
    embeddings: number[][];
    totalTokens: number;
  }> {
    switch (this.config.provider) {
      case 'openai':
        return await this.processOpenAIBatch(texts);
      case 'huggingface':
        return await this.processHuggingFaceBatch(texts);
      case 'custom':
        return await this.processCustomBatch(texts);
      default:
        throw new Error(`Unsupported embedding provider: ${this.config.provider}`);
    }
  }

  private async processOpenAIBatch(texts: string[]): Promise<{
    embeddings: number[][];
    totalTokens: number;
  }> {
    try {
      // Clean and prepare texts
      const cleanedTexts = texts.map(text => this.cleanText(text));

      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: cleanedTexts,
        encoding_format: 'float'
      });

      const embeddings = response.data.map(item => item.embedding);
      const totalTokens = response.usage?.total_tokens || 0;

      return {
        embeddings,
        totalTokens
      };

    } catch (error) {
      if (error.code === 'rate_limit_exceeded') {
        // Wait and retry once
        await this.delay(5000);
        return await this.processOpenAIBatch(texts);
      }
      throw error;
    }
  }

  private async processHuggingFaceBatch(texts: string[]): Promise<{
    embeddings: number[][];
    totalTokens: number;
  }> {
    // TODO: Implement HuggingFace integration
    // For now, fallback to OpenAI
    console.warn('HuggingFace provider not implemented, falling back to OpenAI');
    return await this.processOpenAIBatch(texts);
  }

  private async processCustomBatch(texts: string[]): Promise<{
    embeddings: number[][];
    totalTokens: number;
  }> {
    // TODO: Implement custom embedding provider
    throw new Error('Custom embedding provider not implemented');
  }

  private cleanText(text: string): string {
    // Remove excessive whitespace and newlines
    let cleaned = text.replace(/\s+/g, ' ').trim();
    
    // Truncate if too long for the model
    if (cleaned.length > this.config.maxTokens * 4) { // Rough token estimation
      cleaned = cleaned.substring(0, this.config.maxTokens * 4);
    }

    return cleaned;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default EmbeddingService;