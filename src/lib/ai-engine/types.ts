/**
 * AI Engine Hub Types for SalesFlow AI 2.0
 * Central AI system with sales-optimized modules
 */

// ============================================================================
// CORE AI ENGINE TYPES
// ============================================================================

export interface AIEngineConfig {
  // Model providers
  providers: {
    openai: {
      apiKey: string;
      models: {
        chat: string;
        embedding: string;
        analysis: string;
      };
    };
    anthropic: {
      apiKey: string;
      models: {
        chat: string;
        analysis: string;
      };
    };
    yandex?: {
      apiKey: string;
      folderId: string;
      models: {
        chat: string;
        embedding: string;
      };
    };
  };

  // AI modules configuration
  modules: {
    emotionalAnalysis: {
      enabled: boolean;
      provider: 'openai' | 'anthropic' | 'yandex';
      model?: string;
      threshold: number;
    };
    predictiveAnalysis: {
      enabled: boolean;
      provider: 'openai' | 'anthropic';
      model?: string;
      updateInterval: number; // hours
    };
    businessCoach: {
      enabled: boolean;
      provider: 'openai' | 'anthropic';
      model?: string;
      personalizationLevel: 'basic' | 'advanced' | 'expert';
    };
    competitorIntelligence: {
      enabled: boolean;
      provider: 'openai' | 'anthropic';
      updateFrequency: 'daily' | 'weekly' | 'monthly';
    };
    salesAssistant: {
      enabled: boolean;
      provider: 'openai' | 'anthropic';
      responseStyle: 'professional' | 'casual' | 'adaptive';
    };
  };

  // Performance settings
  performance: {
    maxConcurrentRequests: number;
    requestTimeout: number; // milliseconds
    retryAttempts: number;
    cacheEnabled: boolean;
    cacheTtl: number; // seconds
  };

  // Cost optimization
  costOptimization: {
    budgetLimit: number; // monthly budget in USD
    alertThreshold: number; // percentage of budget
    fallbackToSmallerModels: boolean;
    batchRequests: boolean;
  };
}

// ============================================================================
// AI CONVERSATION TYPES
// ============================================================================

export interface AIConversationRequest {
  message: string;
  tenantId: string;
  userId: string;
  
  // Conversation context
  conversationId?: string;
  messageHistory?: ConversationMessage[];
  
  // Sales context
  salesContext?: SalesAIContext;
  
  // AI behavior
  responseStyle?: 'professional' | 'casual' | 'technical' | 'friendly';
  maxTokens?: number;
  temperature?: number;
  
  // Feature flags
  useRAG?: boolean;
  analyzeEmotions?: boolean;
  provideSuggestions?: boolean;
  includeCompetitorInfo?: boolean;
}

export interface SalesAIContext {
  // Customer information
  customerId?: string;
  customerName?: string;
  customerCompany?: string;
  customerSegment?: string;
  customerIndustry?: string;
  
  // Deal context
  dealId?: string;
  dealValue?: number;
  dealStage?: string;
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
  
  // Sales rep context
  salesRepId?: string;
  salesRepName?: string;
  salesRepExperience?: 'junior' | 'mid' | 'senior' | 'expert';
  
  // Product context
  productIds?: string[];
  productCategories?: string[];
  
  // Conversation context
  communicationChannel?: 'telegram' | 'whatsapp' | 'email' | 'phone' | 'web';
  previousInteractions?: InteractionSummary[];
  competitorMentions?: string[];
  
  // Timing context
  timezone?: string;
  isWorkingHours?: boolean;
  responseUrgency?: 'immediate' | 'same_day' | 'next_business_day';
}

export interface ConversationMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  
  // Message metadata
  messageType?: 'text' | 'image' | 'document' | 'voice';
  attachments?: MessageAttachment[];
  
  // AI analysis results
  analysis?: {
    emotions?: EmotionAnalysis;
    intent?: IntentAnalysis;
    sentiment?: number; // -1 to 1
    urgency?: number; // 0 to 1
    salesOpportunity?: number; // 0 to 1
  };
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'document' | 'audio' | 'video';
  filename: string;
  size: number;
  url: string;
  
  // AI analysis of attachment
  analysis?: {
    extractedText?: string;
    summary?: string;
    relevance?: number;
  };
}

export interface InteractionSummary {
  date: Date;
  channel: string;
  outcome: 'positive' | 'negative' | 'neutral' | 'unclear';
  summary: string;
  nextSteps?: string[];
}

// ============================================================================
// EMOTIONAL ANALYSIS TYPES
// ============================================================================

export interface EmotionAnalysisRequest {
  text: string;
  conversationHistory?: string[];
  salesContext?: SalesAIContext;
}

export interface EmotionAnalysis {
  // Primary emotions (0-1 scale)
  emotions: {
    joy: number;
    anger: number;
    sadness: number;
    fear: number;
    surprise: number;
    disgust: number;
    trust: number;
    anticipation: number;
  };
  
  // Overall sentiment
  sentiment: {
    score: number; // -1 to 1
    label: 'positive' | 'negative' | 'neutral';
    confidence: number; // 0 to 1
  };
  
  // Sales-specific emotions
  salesEmotions: {
    interest: number; // 0 to 1
    frustration: number; // 0 to 1
    excitement: number; // 0 to 1
    skepticism: number; // 0 to 1
    urgency: number; // 0 to 1
    satisfaction: number; // 0 to 1
  };
  
  // Behavioral indicators
  indicators: {
    buyingSignals: string[];
    objectionSignals: string[];
    churnRisk: number; // 0 to 1
    engagementLevel: number; // 0 to 1
  };
  
  // Recommendations
  recommendations: {
    responseStrategy: 'empathetic' | 'analytical' | 'enthusiastic' | 'cautious';
    suggestedActions: string[];
    escalationRecommended: boolean;
    followUpTiming?: 'immediate' | 'few_hours' | 'next_day' | 'few_days';
  };
}

// ============================================================================
// INTENT ANALYSIS TYPES
// ============================================================================

export interface IntentAnalysisRequest {
  text: string;
  conversationHistory?: ConversationMessage[];
  salesContext?: SalesAIContext;
}

export interface IntentAnalysis {
  // Primary intent
  primaryIntent: {
    category: IntentCategory;
    subcategory?: string;
    confidence: number;
  };
  
  // Secondary intents
  secondaryIntents?: {
    category: IntentCategory;
    confidence: number;
  }[];
  
  // Extracted entities
  entities: {
    products?: string[];
    competitors?: string[];
    pricePoints?: number[];
    timeframes?: string[];
    locations?: string[];
    contacts?: string[];
  };
  
  // Sales-specific analysis
  salesAnalysis: {
    buyingStage: 'awareness' | 'consideration' | 'decision' | 'retention';
    decisionInfluence: number; // 0 to 1
    budgetIndicators: string[];
    timelinePressure: 'low' | 'medium' | 'high';
  };
}

export type IntentCategory = 
  | 'information_request'
  | 'pricing_inquiry'
  | 'demo_request'
  | 'support_issue'
  | 'complaint'
  | 'compliment'
  | 'feature_request'
  | 'competitor_comparison'
  | 'purchase_intent'
  | 'cancellation_intent'
  | 'renewal_discussion'
  | 'upsell_opportunity'
  | 'referral'
  | 'meeting_request'
  | 'other';

// ============================================================================
// PREDICTIVE ANALYSIS TYPES
// ============================================================================

export interface PredictiveAnalysisRequest {
  tenantId: string;
  analysisType: 'deal_outcome' | 'churn_risk' | 'revenue_forecast' | 'lead_scoring' | 'next_best_action';
  
  // Input data
  customerId?: string;
  dealId?: string;
  timeframe?: number; // days
  
  // Historical data
  includeHistoricalData?: boolean;
  dataRange?: {
    from: Date;
    to: Date;
  };
}

export interface PredictiveAnalysisResult {
  analysisType: string;
  predictions: {
    outcome: string;
    probability: number;
    confidence: number;
    factors: PredictionFactor[];
  }[];
  
  // Recommendations
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    action: string;
    expectedImpact: string;
    timeline: string;
  }[];
  
  // Model metadata
  modelInfo: {
    modelVersion: string;
    trainingDate: Date;
    accuracy: number;
    dataPoints: number;
  };
}

export interface PredictionFactor {
  factor: string;
  impact: number; // -1 to 1
  importance: number; // 0 to 1
  explanation: string;
}

// ============================================================================
// BUSINESS COACH TYPES
// ============================================================================

export interface BusinessCoachRequest {
  tenantId: string;
  userId: string;
  
  // Coach session type
  sessionType: 'daily_briefing' | 'deal_review' | 'skill_development' | 'performance_analysis' | 'strategy_planning';
  
  // Context
  dealId?: string;
  timeframe?: 'today' | 'week' | 'month' | 'quarter';
  specificQuestion?: string;
  
  // User preferences
  coachingStyle?: 'direct' | 'supportive' | 'analytical' | 'motivational';
  experienceLevel?: 'junior' | 'mid' | 'senior' | 'expert';
}

export interface BusinessCoachResult {
  sessionType: string;
  
  // Main insights
  insights: {
    type: 'strength' | 'opportunity' | 'threat' | 'trend';
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    actionable: boolean;
  }[];
  
  // Recommendations
  recommendations: {
    category: 'process' | 'communication' | 'strategy' | 'skills' | 'tools';
    action: string;
    rationale: string;
    difficulty: 'easy' | 'medium' | 'hard';
    timeToImplement: string;
    expectedImpact: string;
  }[];
  
  // Performance metrics
  metrics?: {
    metric: string;
    current: number;
    target: number;
    trend: 'improving' | 'declining' | 'stable';
    timeframe: string;
  }[];
  
  // Learning resources
  resources?: {
    type: 'article' | 'video' | 'course' | 'template' | 'tool';
    title: string;
    description: string;
    url?: string;
    estimatedTime?: string;
  }[];
}

// ============================================================================
// COMPETITOR INTELLIGENCE TYPES
// ============================================================================

export interface CompetitorIntelligenceRequest {
  tenantId: string;
  competitorName?: string;
  industry?: string;
  analysisType: 'pricing' | 'features' | 'marketing' | 'reviews' | 'news' | 'comprehensive';
}

export interface CompetitorIntelligenceResult {
  competitor: {
    name: string;
    industry: string;
    lastUpdated: Date;
  };
  
  // Analysis results
  analysis: {
    pricing?: {
      plans: CompetitorPlan[];
      priceRange: { min: number; max: number };
      pricingStrategy: string;
      competitivePosition: 'premium' | 'market' | 'budget';
    };
    
    features?: {
      strengths: string[];
      weaknesses: string[];
      uniqueFeatures: string[];
      missingFeatures: string[];
    };
    
    marketing?: {
      positioning: string;
      targetAudience: string[];
      marketingChannels: string[];
      messagingThemes: string[];
    };
    
    reviews?: {
      averageRating: number;
      reviewCount: number;
      commonComplaints: string[];
      commonPraises: string[];
      sentiment: number; // -1 to 1
    };
  };
  
  // Competitive recommendations
  recommendations: {
    battlecard: {
      ourStrengths: string[];
      theirWeaknesses: string[];
      differentiators: string[];
      objectionHandling: string[];
    };
    
    strategicActions: {
      priority: 'high' | 'medium' | 'low';
      action: string;
      rationale: string;
      timeline: string;
    }[];
  };
}

export interface CompetitorPlan {
  name: string;
  price: number;
  currency: string;
  billing: 'monthly' | 'annual';
  features: string[];
  limitations?: string[];
}

// ============================================================================
// AI RESPONSE TYPES
// ============================================================================

export interface AIConversationResponse {
  message: string;
  confidence: number;
  
  // Response metadata
  responseTime: number; // milliseconds
  tokensUsed: number;
  model: string;
  
  // Analysis results
  analysis?: {
    emotions?: EmotionAnalysis;
    intent?: IntentAnalysis;
    predictive?: PredictiveAnalysisResult;
  };
  
  // Suggestions for sales rep
  suggestions?: {
    nextQuestions: string[];
    followUpActions: string[];
    escalationRecommended: boolean;
    resourceRecommendations: string[];
  };
  
  // Competitor insights (if relevant)
  competitorInsights?: {
    mentionedCompetitors: string[];
    battlecardSuggestions: string[];
    differentiators: string[];
  };
  
  // Source citations (from RAG)
  sources?: {
    documentId: string;
    title: string;
    relevance: number;
    snippet: string;
  }[];
}

// ============================================================================
// USAGE TRACKING TYPES
// ============================================================================

export interface AIUsageMetrics {
  tenantId: string;
  period: {
    from: Date;
    to: Date;
  };
  
  // Usage by module
  moduleUsage: {
    module: string;
    requests: number;
    tokensUsed: number;
    cost: number;
    averageResponseTime: number;
  }[];
  
  // Usage by user
  userUsage: {
    userId: string;
    requests: number;
    tokensUsed: number;
    cost: number;
  }[];
  
  // Totals
  totals: {
    requests: number;
    tokensUsed: number;
    cost: number;
    averageResponseTime: number;
  };
  
  // Quality metrics
  quality: {
    averageConfidence: number;
    userSatisfactionScore?: number;
    escalationRate: number;
    successfulConversations: number;
  };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class AIEngineError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AIEngineError';
  }
}

export class ModelProviderError extends AIEngineError {
  constructor(
    provider: string,
    message: string,
    details?: Record<string, any>
  ) {
    super(
      `${provider} provider error: ${message}`,
      'MODEL_PROVIDER_ERROR',
      502,
      details
    );
  }
}

export class RateLimitError extends AIEngineError {
  constructor(
    provider: string,
    retryAfter?: number
  ) {
    super(
      `Rate limit exceeded for ${provider}`,
       'RATE_LIMIT_EXCEEDED',
      429,
      { retryAfter }
    );
  }
}

export class BudgetExceededError extends AIEngineError {
  constructor(
    currentSpend: number,
    limit: number
  ) {
    super(
      `Budget limit exceeded: $${currentSpend} of $${limit}`,
      'BUDGET_EXCEEDED',
      402,
      { currentSpend, limit }
    );
  }
}