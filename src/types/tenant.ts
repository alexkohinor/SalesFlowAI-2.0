/**
 * Multi-tenant system types for SalesFlow AI 2.0
 * Based on Lawer architecture with sales-specific extensions
 */

// ============================================================================
// CORE TENANT TYPES
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  domain: string | null;
  slug: string;
  plan: TenantPlan;
  
  // SalesFlow AI specific
  salesConfig: SalesConfig;
  integrationLimits: IntegrationLimits;
  
  // Subscription
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: Date | null;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export type TenantPlan = 'starter' | 'business' | 'enterprise' | 'custom';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled';

export interface SalesConfig {
  targetAudience?: string;
  averageDealSize?: number;
  salesCycleDays?: number;
  timezone?: string;
  currency?: string;
  industry?: string;
  
  // AI Features configuration
  aiFeatures?: {
    businessCoachEnabled?: boolean;
    emotionalAnalysisEnabled?: boolean;
    predictiveInsightsEnabled?: boolean;
    competitorDetectionEnabled?: boolean;
    psychologicalProfilingEnabled?: boolean;
  };
}

export interface IntegrationLimits {
  crmConnections: number;
  messengerBots: number;
  monthlyMessages: number;
  knowledgeBaseMb: number;
  ecommerceIntegrations?: number;
  customIntegrations?: number;
}

// ============================================================================
// AI ASSISTANT TYPES
// ============================================================================

export interface AIAssistant {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  
  // AI Configuration
  config: AIConfig;
  salesConfig: AISalesConfig;
  
  // Integration & Knowledge
  integrations: Record<string, any>;
  knowledgeBase: KnowledgeBaseConfig;
  
  // Status
  status: AIAssistantStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type AIAssistantStatus = 'active' | 'paused' | 'training' | 'inactive';

export interface AIConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  personality: string;
  
  // Advanced settings
  systemPrompt?: string;
  fallbackResponse?: string;
  confidenceThreshold?: number;
}

export interface AISalesConfig {
  leadQualificationEnabled: boolean;
  emotionalAnalysisEnabled: boolean;
  competitorDetectionEnabled: boolean;
  predictiveInsightsEnabled: boolean;
  
  // Sales-specific settings
  autoEscalationRules?: EscalationRule[];
  leadScoringWeights?: LeadScoringWeights;
  dealStageMapping?: Record<string, string>;
}

export interface EscalationRule {
  condition: string;
  threshold: number;
  action: 'escalate' | 'notify' | 'tag';
  target?: string;
}

export interface LeadScoringWeights {
  messageEngagement: number;
  responseTime: number;
  sentimentScore: number;
  intentStrength: number;
  demographicMatch: number;
}

export interface KnowledgeBaseConfig {
  autoLearning: boolean;
  sources: string[];
  lastTraining: Date | null;
  
  // Sales-specific knowledge
  productCatalogEnabled?: boolean;
  competitorIntelEnabled?: boolean;
  salesScriptsEnabled?: boolean;
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface Conversation {
  id: string;
  tenantId: string;
  assistantId: string;
  
  // Customer information
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  
  // Conversation metadata
  channel: Channel;
  channelConversationId?: string;
  
  // Sales context
  salesStage: SalesStage;
  leadScore: number;
  dealProbability: number;
  estimatedDealValue?: number;
  
  // Status
  status: ConversationStatus;
  escalated: boolean;
  escalatedAt?: Date;
  
  // Timestamps
  startedAt: Date;
  lastMessageAt: Date;
  endedAt?: Date;
}

export type Channel = 'telegram' | 'whatsapp' | 'web' | 'facebook' | 'vk';
export type ConversationStatus = 'active' | 'paused' | 'completed' | 'escalated';
export type SalesStage = 'initial_contact' | 'qualification' | 'proposal' | 'negotiation' | 'closing' | 'won' | 'lost';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  
  // Content
  content: string;
  messageType: MessageType;
  
  // Direction and sender
  direction: MessageDirection;
  senderType: SenderType;
  
  // External data
  externalMessageId?: string;
  externalData?: Record<string, any>;
  
  // AI Analysis
  aiAnalysis: AIAnalysis;
  
  // Processing
  processed: boolean;
  processedAt?: Date;
  
  createdAt: Date;
}

export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video';
export type MessageDirection = 'inbound' | 'outbound';
export type SenderType = 'customer' | 'assistant' | 'human';

export interface AIAnalysis {
  sentiment?: 'positive' | 'negative' | 'neutral';
  emotions?: EmotionScores;
  intent?: string;
  entities?: NamedEntity[];
  confidence?: number;
  
  // Sales-specific analysis
  salesSignals?: SalesSignal[];
  competitorMentions?: CompetitorMention[];
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface EmotionScores {
  joy?: number;
  anger?: number;
  sadness?: number;
  fear?: number;
  surprise?: number;
  disgust?: number;
}

export interface NamedEntity {
  type: string;
  value: string;
  confidence: number;
  start?: number;
  end?: number;
}

export interface SalesSignal {
  type: 'buying_intent' | 'objection' | 'price_concern' | 'competitor_mention' | 'timeline_mention';
  confidence: number;
  context: string;
}

export interface CompetitorMention {
  competitor: string;
  context: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

export interface Integration {
  id: string;
  tenantId: string;
  
  integrationType: IntegrationType;
  integrationName: string;
  
  config: Record<string, any>;
  credentials: Record<string, any>; // Encrypted
  
  status: IntegrationStatus;
  lastSyncAt?: Date;
  syncError?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export type IntegrationType = 
  // CRM
  | 'amocrm' | 'bitrix24' | 'hubspot' | 'pipedrive'
  // Messengers
  | 'telegram' | 'whatsapp' | 'vk' | 'facebook'
  // E-commerce
  | 'wildberries' | 'ozon' | 'avito';

export type IntegrationStatus = 'active' | 'inactive' | 'error' | 'pending';

// ============================================================================
// KNOWLEDGE BASE TYPES
// ============================================================================

export interface KnowledgeDocument {
  id: string;
  tenantId: string;
  
  title: string;
  content: string;
  documentType: DocumentType;
  salesCategory?: SalesCategory;
  
  // File information
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileUrl?: string;
  
  // Processing
  processed: boolean;
  vectorized: boolean;
  processingError?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export type DocumentType = 'general' | 'faq' | 'manual' | 'product' | 'policy';
export type SalesCategory = 'product_catalog' | 'sales_scripts' | 'competitor_analysis' | 'pricing' | 'objection_handling';

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface SalesMetrics {
  id: string;
  tenantId: string;
  metricDate: Date;
  
  // Basic metrics
  totalConversations: number;
  totalMessages: number;
  uniqueCustomers: number;
  
  // Sales metrics
  leadsGenerated: number;
  leadsQualified: number;
  dealsCreated: number;
  dealsWon: number;
  totalDealValue: number;
  
  // AI metrics
  aiAccuracyScore: number;
  emotionalAnalysisAccuracy: number;
  autoResolutionRate: number;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateTenantRequest {
  name: string;
  domain?: string;
  slug: string;
  plan?: TenantPlan;
  salesConfig?: Partial<SalesConfig>;
}

export interface UpdateTenantRequest {
  name?: string;
  domain?: string;
  plan?: TenantPlan;
  salesConfig?: Partial<SalesConfig>;
  integrationLimits?: Partial<IntegrationLimits>;
}

export interface CreateAssistantRequest {
  name: string;
  description?: string;
  config?: Partial<AIConfig>;
  salesConfig?: Partial<AISalesConfig>;
}

export interface TenantContext {
  tenantId: string;
  userId?: string;
  permissions?: string[];
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class TenantError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'TenantError';
  }
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    public integrationType: IntegrationType,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}