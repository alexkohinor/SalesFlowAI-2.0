/**
 * Generation Service for SalesFlow AI 2.0
 * Handles answer generation using various LLM providers
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface GenerationModelConfig {
  provider: 'openai' | 'anthropic' | 'yandex';
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface GenerationRequest {
  query: string;
  context: string;
  salesContext?: {
    customerName?: string;
    customerRole?: string;
    customerCompany?: string;
    salesRepName?: string;
    salesRepRole?: string;
    communicationStyle?: 'formal' | 'casual' | 'technical' | 'friendly';
    responseType?: 'answer' | 'proposal' | 'objection_handling' | 'follow_up';
    dealContext?: {
      dealValue?: number;
      timeline?: string;
      decisionMakers?: string[];
      competitorsInvolved?: string[];
    };
  };
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'structured' | 'bullets' | 'table';
}

export interface GenerationResponse {
  answer: string;
  confidence: number;
  metadata: {
    model: string;
    tokensUsed: number;
    processingTime: number;
    sourcesConsidered: number;
    sourcesUsed: number;
  };
}

// ============================================================================
// GENERATION SERVICE CLASS
// ============================================================================

export class GenerationService {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private config: GenerationModelConfig;

  constructor(config: GenerationModelConfig) {
    this.config = config;
    
    if (config.provider === 'openai') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    } else if (config.provider === 'anthropic') {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
  }

  /**
   * Generate answer using the configured LLM
   */
  async generateAnswer(request: GenerationRequest): Promise<GenerationResponse> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildPrompt(request);
      
      let response: { content: string; tokensUsed: number };
      
      switch (this.config.provider) {
        case 'openai':
          response = await this.generateWithOpenAI(prompt, request);
          break;
        case 'anthropic':
          response = await this.generateWithAnthropic(prompt, request);
          break;
        case 'yandex':
          response = await this.generateWithYandex(prompt, request);
          break;
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
      
      // Calculate confidence based on response quality
      const confidence = this.calculateConfidence(response.content, request.context);
      
      return {
        answer: response.content,
        confidence,
        metadata: {
          model: this.config.model,
          tokensUsed: response.tokensUsed,
          processingTime: Date.now() - startTime,
          sourcesConsidered: this.countSources(request.context),
          sourcesUsed: this.countUsedSources(response.content, request.context)
        }
      };
      
    } catch (error) {
      throw new Error(`Answer generation failed: ${error.message}`);
    }
  }

  /**
   * Generate sales-optimized responses
   */
  async generateSalesResponse(
    query: string,
    context: string,
    salesContext: NonNullable<GenerationRequest['salesContext']>
  ): Promise<GenerationResponse> {
    const request: GenerationRequest = {
      query,
      context,
      salesContext,
      responseFormat: 'structured'
    };

    return await this.generateAnswer(request);
  }

  // ============================================================================
  // PROVIDER-SPECIFIC METHODS
  // ============================================================================

  private async generateWithOpenAI(
    prompt: string,
    request: GenerationRequest
  ): Promise<{ content: string; tokensUsed: number }> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: request.maxTokens || this.config.maxTokens,
      temperature: request.temperature || this.config.temperature,
      stream: false
    });

    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    return { content, tokensUsed };
  }

  private async generateWithAnthropic(
    prompt: string,
    request: GenerationRequest
  ): Promise<{ content: string; tokensUsed: number }> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: request.maxTokens || this.config.maxTokens,
      temperature: request.temperature || this.config.temperature,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

    return { content, tokensUsed };
  }

  private async generateWithYandex(
    prompt: string,
    request: GenerationRequest
  ): Promise<{ content: string; tokensUsed: number }> {
    // TODO: Implement Yandex GPT integration
    throw new Error('Yandex GPT integration not implemented yet');
  }

  // ============================================================================
  // PROMPT BUILDING
  // ============================================================================

  private buildPrompt(request: GenerationRequest): string {
    const systemPrompt = this.buildSystemPrompt(request.salesContext);
    const contextPrompt = this.buildContextPrompt(request.context);
    const queryPrompt = this.buildQueryPrompt(request.query, request.responseFormat);
    
    return `${systemPrompt}\n\n${contextPrompt}\n\n${queryPrompt}`;
  }

  private buildSystemPrompt(salesContext?: GenerationRequest['salesContext']): string {
    let prompt = `Ты - экспертный AI-ассистент для продаж в системе SalesFlow AI. 
Твоя задача - предоставлять точные, полезные и релевантные ответы на основе предоставленного контекста.

Основные принципы:
- Отвечай только на основе предоставленной информации
- Если информации недостаточно, честно об этом скажи
- Адаптируй стиль общения под контекст продаж
- Предлагай конкретные действия, когда это уместно
- Учитывай специфику российского рынка`;

    if (salesContext) {
      prompt += `\n\nКонтекст продаж:`;
      
      if (salesContext.customerName) {
        prompt += `\n- Клиент: ${salesContext.customerName}`;
      }
      
      if (salesContext.customerCompany) {
        prompt += `\n- Компания: ${salesContext.customerCompany}`;
      }
      
      if (salesContext.salesRepName) {
        prompt += `\n- Менеджер: ${salesContext.salesRepName}`;
      }
      
      if (salesContext.communicationStyle) {
        const styleMap = {
          formal: 'официальный',
          casual: 'неформальный',
          technical: 'технический',
          friendly: 'дружелюбный'
        };
        prompt += `\n- Стиль общения: ${styleMap[salesContext.communicationStyle]}`;
      }
      
      if (salesContext.responseType) {
        const typeMap = {
          answer: 'ответ на вопрос',
          proposal: 'коммерческое предложение',
          objection_handling: 'работа с возражениями',
          follow_up: 'последующий контакт'
        };
        prompt += `\n- Тип ответа: ${typeMap[salesContext.responseType]}`;
      }
      
      if (salesContext.dealContext) {
        prompt += `\n- Контекст сделки:`;
        if (salesContext.dealContext.dealValue) {
          prompt += ` бюджет ${salesContext.dealContext.dealValue} руб.`;
        }
        if (salesContext.dealContext.timeline) {
          prompt += ` сроки: ${salesContext.dealContext.timeline}`;
        }
        if (salesContext.dealContext.competitorsInvolved?.length) {
          prompt += ` конкуренты: ${salesContext.dealContext.competitorsInvolved.join(', ')}`;
        }
      }
    }

    return prompt;
  }

  private buildContextPrompt(context: string): string {
    return `Доступная информация для ответа:\n\n${context}`;
  }

  private buildQueryPrompt(query: string, format?: string): string {
    let prompt = `Вопрос клиента: ${query}\n\nОтветь на вопрос`;
    
    if (format) {
      const formatMap = {
        text: 'в виде текста',
        structured: 'структурированно с заголовками',
        bullets: 'в виде маркированного списка',
        table: 'в виде таблицы'
      };
      prompt += ` ${formatMap[format] || 'в текстовом формате'}`;
    }
    
    prompt += `. Включи конкретные рекомендации по следующим шагам, если это уместно.`;
    
    return prompt;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private calculateConfidence(answer: string, context: string): number {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence if answer is longer and more detailed
    if (answer.length > 200) confidence += 0.1;
    if (answer.length > 500) confidence += 0.1;
    
    // Higher confidence if answer references context
    const contextWords = context.toLowerCase().split(' ');
    const answerWords = answer.toLowerCase().split(' ');
    const overlap = contextWords.filter(word => 
      answerWords.includes(word) && word.length > 3
    ).length;
    
    const overlapRatio = overlap / Math.min(contextWords.length, 100);
    confidence += overlapRatio * 0.3;
    
    // Lower confidence if answer contains uncertainty phrases
    const uncertaintyPhrases = [
      'не уверен', 'возможно', 'вероятно', 'может быть',
      'not sure', 'possibly', 'maybe', 'might be'
    ];
    
    uncertaintyPhrases.forEach(phrase => {
      if (answer.toLowerCase().includes(phrase)) {
        confidence -= 0.1;
      }
    });
    
    return Math.max(0.1, Math.min(0.95, confidence));
  }

  private countSources(context: string): number {
    // Count the number of source documents mentioned in context
    const sourceMatches = context.match(/Title:/g);
    return sourceMatches ? sourceMatches.length : 0;
  }

  private countUsedSources(answer: string, context: string): number {
    // Estimate how many sources were actually used in the answer
    // This is a simplified heuristic
    const contextWords = new Set(
      context.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 4)
    );
    
    const answerWords = new Set(
      answer.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 4)
    );
    
    const intersection = new Set(
      [...answerWords].filter(word => contextWords.has(word))
    );
    
    // Rough estimate: if 20% of content words overlap, probably used 1 source
    const overlapRatio = intersection.size / Math.max(answerWords.size, 1);
    return Math.ceil(overlapRatio * this.countSources(context));
  }
}

export default GenerationService;