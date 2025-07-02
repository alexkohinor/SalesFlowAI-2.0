/**
 * Document Processor for SalesFlow AI 2.0
 * Handles text extraction, chunking, and sales-specific metadata extraction
 */

import {
  DocumentProcessingRequest,
  DocumentProcessingResult,
  DocumentSource,
  ProcessingOptions,
  DocumentChunk,
  ExtractedProduct,
  ExtractedPricing,
  ExtractedCompetitor,
  RAGConfig
} from './types';

// ============================================================================
// DOCUMENT PROCESSOR CLASS
// ============================================================================

export class DocumentProcessor {
  private config: RAGConfig;

  constructor(config: RAGConfig) {
    this.config = config;
  }

  /**
   * Process document from various sources
   */
  async process(request: DocumentProcessingRequest): Promise<DocumentProcessingResult> {
    const startTime = Date.now();
    
    try {
      // Extract text from source
      const extractedText = await this.extractText(request.source);
      
      if (!extractedText || extractedText.trim().length === 0) {
        return {
          success: false,
          processingMetadata: {
            processingTime: Date.now() - startTime,
            chunksCreated: 0,
            embeddingsGenerated: 0,
            tokensProcessed: 0,
            errors: ['No text could be extracted from the document']
          }
        };
      }

      // Create chunks from extracted text
      const chunks = await this.createChunks(extractedText, request.options);
      
      // Extract sales-specific information if enabled
      const extractedInfo = await this.extractSalesInfo(extractedText, request.options);
      
      // Count tokens
      const tokensProcessed = this.estimateTokens(extractedText);

      return {
        success: true,
        extractedText,
        chunks,
        extractedInfo,
        processingMetadata: {
          processingTime: Date.now() - startTime,
          chunksCreated: chunks.length,
          embeddingsGenerated: 0, // Will be set by RAG manager
          tokensProcessed,
          warnings: this.generateWarnings(extractedText, chunks)
        }
      };

    } catch (error) {
      return {
        success: false,
        processingMetadata: {
          processingTime: Date.now() - startTime,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          tokensProcessed: 0,
          errors: [error.message]
        }
      };
    }
  }

  // ============================================================================
  // TEXT EXTRACTION METHODS
  // ============================================================================

  private async extractText(source: DocumentSource): Promise<string> {
    switch (source.type) {
      case 'text':
        return source.text || '';
      
      case 'file':
        return await this.extractFromFile(source.file!);
      
      case 'url':
        return await this.extractFromUrl(source.url!);
      
      case 'api':
        return await this.extractFromApi(source.apiSource!);
      
      default:
        throw new Error(`Unsupported source type: ${source.type}`);
    }
  }

  private async extractFromFile(file: {
    buffer: Buffer;
    filename: string;
    mimetype: string;
  }): Promise<string> {
    const { buffer, mimetype, filename } = file;

    // Handle different file types
    switch (mimetype) {
      case 'text/plain':
        return buffer.toString('utf-8');
      
      case 'application/pdf':
        return await this.extractFromPDF(buffer);
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return await this.extractFromWord(buffer);
      
      case 'text/html':
        return await this.extractFromHTML(buffer.toString('utf-8'));
      
      case 'application/json':
        return await this.extractFromJSON(buffer.toString('utf-8'));
      
      default:
        // Try to extract as plain text
        const text = buffer.toString('utf-8');
        if (this.isValidText(text)) {
          return text;
        }
        throw new Error(`Unsupported file type: ${mimetype}`);
    }
  }

  private async extractFromPDF(buffer: Buffer): Promise<string> {
    // TODO: Implement PDF extraction using pdf-parse or similar
    // For now, throw error indicating need for implementation
    throw new Error('PDF extraction not implemented yet. Please use text files.');
  }

  private async extractFromWord(buffer: Buffer): Promise<string> {
    // TODO: Implement Word document extraction using mammoth or similar
    throw new Error('Word document extraction not implemented yet. Please use text files.');
  }

  private async extractFromHTML(html: string): Promise<string> {
    // Remove HTML tags and extract text content
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private async extractFromJSON(json: string): Promise<string> {
    try {
      const data = JSON.parse(json);
      return this.extractTextFromObject(data);
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  }

  private async extractFromUrl(url: string): Promise<string> {
    // TODO: Implement URL content extraction
    // For now, throw error indicating need for implementation
    throw new Error('URL extraction not implemented yet. Please upload files directly.');
  }

  private async extractFromApi(apiSource: {
    provider: string;
    resourceId: string;
    credentials?: Record<string, any>;
  }): Promise<string> {
    // TODO: Implement API source extraction
    throw new Error('API source extraction not implemented yet.');
  }

  // ============================================================================
  // CHUNKING METHODS
  // ============================================================================

  private async createChunks(
    text: string,
    options: ProcessingOptions
  ): Promise<DocumentChunk[]> {
    switch (options.chunkStrategy) {
      case 'sentence':
        return this.chunkBySentence(text, options);
      
      case 'paragraph':
        return this.chunkByParagraph(text, options);
      
      case 'section':
        return this.chunkBySection(text, options);
      
      case 'fixed_size':
        return this.chunkByFixedSize(text, options);
      
      case 'semantic':
        return this.chunkBySemantic(text, options);
      
      default:
        return this.chunkByParagraph(text, options); // Default strategy
    }
  }

  private chunkBySentence(text: string, options: ProcessingOptions): DocumentChunk[] {
    const sentences = this.splitIntoSentences(text);
    const chunks: DocumentChunk[] = [];
    const chunkSize = options.chunkSize || 3; // 3 sentences per chunk
    const overlap = options.chunkOverlap || 1; // 1 sentence overlap

    for (let i = 0; i < sentences.length; i += chunkSize - overlap) {
      const chunkSentences = sentences.slice(i, i + chunkSize);
      const content = chunkSentences.join(' ');
      
      if (content.trim().length > 0) {
        chunks.push(this.createChunk(content, chunks.length, i, text));
      }
    }

    return chunks;
  }

  private chunkByParagraph(text: string, options: ProcessingOptions): DocumentChunk[] {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: DocumentChunk[] = [];
    const maxChunkSize = options.chunkSize || 1000;
    
    let currentChunk = '';
    let startPosition = 0;

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
        // Create chunk from current content
        chunks.push(this.createChunk(currentChunk.trim(), chunks.length, startPosition, text));
        
        // Start new chunk with overlap if configured
        const overlap = options.chunkOverlap || 0;
        if (overlap > 0 && currentChunk.length > overlap) {
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + '\n\n' + paragraph;
        } else {
          currentChunk = paragraph;
        }
        startPosition = text.indexOf(paragraph);
      } else {
        if (currentChunk.length === 0) {
          startPosition = text.indexOf(paragraph);
        }
        currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph;
      }
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(currentChunk.trim(), chunks.length, startPosition, text));
    }

    return chunks;
  }

  private chunkBySection(text: string, options: ProcessingOptions): DocumentChunk[] {
    // Split by common section markers
    const sections = text.split(/\n\s*#{1,6}\s+|\n\s*\d+\.\s+|\n\s*[A-Z][A-Z\s]+:/);
    const chunks: DocumentChunk[] = [];

    sections.forEach((section, index) => {
      const content = section.trim();
      if (content.length > 0) {
        chunks.push(this.createChunk(content, index, text.indexOf(content), text));
      }
    });

    return chunks;
  }

  private chunkByFixedSize(text: string, options: ProcessingOptions): DocumentChunk[] {
    const chunkSize = options.chunkSize || 1000;
    const overlap = options.chunkOverlap || 100;
    const chunks: DocumentChunk[] = [];

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunk = text.slice(i, i + chunkSize);
      if (chunk.trim().length > 0) {
        chunks.push(this.createChunk(chunk, chunks.length, i, text));
      }
    }

    return chunks;
  }

  private chunkBySemantic(text: string, options: ProcessingOptions): DocumentChunk[] {
    // TODO: Implement semantic chunking using NLP models
    // For now, fallback to paragraph chunking
    console.warn('Semantic chunking not implemented, falling back to paragraph chunking');
    return this.chunkByParagraph(text, options);
  }

  // ============================================================================
  // SALES-SPECIFIC EXTRACTION
  // ============================================================================

  private async extractSalesInfo(
    text: string,
    options: ProcessingOptions
  ): Promise<{
    products?: ExtractedProduct[];
    pricing?: ExtractedPricing[];
    competitors?: ExtractedCompetitor[];
    salesStages?: string[];
  }> {
    const result: any = {};

    if (options.extractProductInfo) {
      result.products = await this.extractProducts(text);
    }

    if (options.extractPricing) {
      result.pricing = await this.extractPricing(text);
    }

    if (options.extractCompetitorMentions) {
      result.competitors = await this.extractCompetitors(text);
    }

    if (options.detectSalesStages) {
      result.salesStages = await this.detectSalesStages(text);
    }

    return result;
  }

  private async extractProducts(text: string): Promise<ExtractedProduct[]> {
    // TODO: Implement product extraction using NLP
    // For now, return empty array
    return [];
  }

  private async extractPricing(text: string): Promise<ExtractedPricing[]> {
    const pricing: ExtractedPricing[] = [];
    
    // Simple regex patterns for price detection
    const pricePatterns = [
      /([\d\s]+)\s*(?:руб|рублей|₽)/gi,
      /\$\s*([\d\s]+)/gi,
      /([\d\s]+)\s*(?:долларов?|USD)/gi,
      /от\s+([\d\s]+)\s*(?:руб|рублей|₽)/gi,
      /до\s+([\d\s]+)\s*(?:руб|рублей|₽)/gi
    ];

    pricePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const price = parseFloat(match[1].replace(/\s/g, ''));
        if (!isNaN(price)) {
          pricing.push({
            price,
            currency: match[0].includes('$') || match[0].includes('USD') ? 'USD' : 'RUB',
            priceType: match[0].includes('от') ? 'starting_from' : 
                     match[0].includes('до') ? 'up_to' : 'fixed',
            confidence: 0.8
          });
        }
      }
    });

    return pricing;
  }

  private async extractCompetitors(text: string): Promise<ExtractedCompetitor[]> {
    // TODO: Implement competitor detection using predefined lists and NLP
    return [];
  }

  private async detectSalesStages(text: string): Promise<string[]> {
    const stages: string[] = [];
    const stageKeywords = {
      'prospecting': ['поиск клиентов', 'лиды', 'prospects'],
      'qualification': ['квалификация', 'потребности', 'бюджет'],
      'proposal': ['предложение', 'презентация', 'proposal'],
      'negotiation': ['переговоры', 'обсуждение цены', 'negotiation'],
      'closing': ['закрытие сделки', 'подписание', 'closing']
    };

    Object.entries(stageKeywords).forEach(([stage, keywords]) => {
      const found = keywords.some(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
      );
      if (found) {
        stages.push(stage);
      }
    });

    return stages;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private createChunk(
    content: string,
    index: number,
    startPosition: number,
    fullText: string
  ): DocumentChunk {
    return {
      id: `chunk_${index}_${Date.now()}`,
      content: content.trim(),
      startPosition,
      endPosition: startPosition + content.length,
      chunkIndex: index,
      metadata: {
        chunkType: this.inferChunkType(content),
        section: this.extractSection(content),
        pageNumber: Math.floor(startPosition / 2000) + 1 // Rough page estimation
      },
      salesMetadata: {
        containsProductInfo: this.containsProductInfo(content),
        containsPricing: this.containsPricing(content),
        containsCompetitorInfo: this.containsCompetitorInfo(content),
        salesRelevanceScore: this.calculateSalesRelevance(content)
      }
    };
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting for Russian text
    return text
      .split(/[.!?]\s+/)
      .filter(sentence => sentence.trim().length > 0)
      .map(sentence => sentence.trim());
  }

  private inferChunkType(content: string): 'text' | 'table' | 'list' | 'heading' {
    if (content.includes('\t') || content.includes('|')) {
      return 'table';
    }
    if (content.match(/^\s*[-*]\s+/m) || content.match(/^\s*\d+\.\s+/m)) {
      return 'list';
    }
    if (content.match(/^[A-ZА-Я][A-ZА-Я\s]+:?$/m)) {
      return 'heading';
    }
    return 'text';
  }

  private extractSection(content: string): string | undefined {
    const headingMatch = content.match(/^([A-ZА-Я][^\n]*):?/m);
    return headingMatch ? headingMatch[1] : undefined;
  }

  private containsProductInfo(content: string): boolean {
    const productKeywords = ['продукт', 'товар', 'услуга', 'функция', 'характеристика'];
    return productKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
  }

  private containsPricing(content: string): boolean {
    return /\d+\s*(?:руб|рублей|₽|\$|долларов|USD)/i.test(content);
  }

  private containsCompetitorInfo(content: string): boolean {
    const competitorKeywords = ['конкурент', 'сравнение', 'альтернатива', 'competitor'];
    return competitorKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
  }

  private calculateSalesRelevance(content: string): number {
    let score = 0;
    
    if (this.containsProductInfo(content)) score += 0.3;
    if (this.containsPricing(content)) score += 0.4;
    if (this.containsCompetitorInfo(content)) score += 0.2;
    
    // Boost for sales-specific terms
    const salesTerms = ['продажи', 'клиент', 'сделка', 'договор', 'контракт'];
    salesTerms.forEach(term => {
      if (content.toLowerCase().includes(term)) score += 0.1;
    });
    
    return Math.min(score, 1.0);
  }

  private isValidText(text: string): boolean {
    // Check if text contains mostly printable characters
    const printableRatio = (text.match(/[\x20-\x7E\u0400-\u04FF]/g) || []).length / text.length;
    return printableRatio > 0.8;
  }

  private extractTextFromObject(obj: any, path: string = ''): string {
    let text = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        text += `${key}: ${value}\n`;
      } else if (typeof value === 'object' && value !== null) {
        text += this.extractTextFromObject(value, `${path}.${key}`);
      }
    }
    
    return text;
  }

  private estimateTokens(text: string): number {
    // Rough token estimation: ~4 characters per token for Russian text
    return Math.ceil(text.length / 4);
  }

  private generateWarnings(text: string, chunks: DocumentChunk[]): string[] {
    const warnings: string[] = [];
    
    if (text.length < 100) {
      warnings.push('Document is very short, may not provide sufficient context');
    }
    
    if (chunks.length === 0) {
      warnings.push('No chunks were created from the document');
    }
    
    if (chunks.length > 1000) {
      warnings.push('Document created many chunks, consider using larger chunk size');
    }
    
    return warnings;
  }
}

export default DocumentProcessor;