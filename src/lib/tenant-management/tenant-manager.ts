/**
 * Tenant Manager for SalesFlow AI 2.0
 * Based on Lawer architecture with sales-specific extensions
 */

import { 
  Tenant, 
  CreateTenantRequest, 
  UpdateTenantRequest, 
  TenantContext,
  TenantError,
  AIAssistant,
  CreateAssistantRequest,
  SalesConfig,
  IntegrationLimits
} from '@/types/tenant';

// ============================================================================
// TENANT MANAGER CLASS
// ============================================================================

export class TenantManager {
  private supabase: any; // Supabase client
  private s3Manager: any; // S3 Manager instance
  
  constructor(supabaseClient: any, s3Manager: any) {
    this.supabase = supabaseClient;
    this.s3Manager = s3Manager;
  }

  // ============================================================================
  // TENANT CRUD OPERATIONS
  // ============================================================================

  /**
   * Create new tenant with complete setup
   * Adapted from Lawer with SalesFlow AI extensions
   */
  async createTenant(data: CreateTenantRequest): Promise<Tenant> {
    try {
      // Validate tenant data
      await this.validateTenantData(data);
      
      // Create tenant record
      const tenant = await this.createTenantRecord(data);
      
      // Set up tenant infrastructure
      await this.setupTenantInfrastructure(tenant.id);
      
      // Create default AI assistant for sales
      await this.createDefaultSalesAssistant(tenant.id);
      
      // Initialize sales metrics
      await this.initializeSalesMetrics(tenant.id);
      
      return tenant;
    } catch (error) {
      throw new TenantError(
        `Failed to create tenant: ${error.message}`,
        'TENANT_CREATION_FAILED',
        500
      );
    }
  }

  /**
   * Get tenant by ID with sales configuration
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    const { data, error } = await this.supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new TenantError('Failed to fetch tenant', 'TENANT_FETCH_FAILED');
    }
    
    return this.mapDatabaseToTenant(data);
  }

  /**
   * Get tenant by domain or slug
   */
  async getTenantByIdentifier(identifier: string): Promise<Tenant | null> {
    const { data, error } = await this.supabase
      .from('tenants')
      .select('*')
      .or(`domain.eq.${identifier},slug.eq.${identifier}`)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new TenantError('Failed to fetch tenant by identifier', 'TENANT_FETCH_FAILED');
    }
    
    return this.mapDatabaseToTenant(data);
  }

  /**
   * Update tenant configuration
   */
  async updateTenant(tenantId: string, updates: UpdateTenantRequest): Promise<Tenant> {
    const { data, error } = await this.supabase
      .from('tenants')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', tenantId)
      .select()
      .single();
    
    if (error) {
      throw new TenantError('Failed to update tenant', 'TENANT_UPDATE_FAILED');
    }
    
    return this.mapDatabaseToTenant(data);
  }

  /**
   * Delete tenant and all associated data
   */
  async deleteTenant(tenantId: string): Promise<void> {
    try {
      // Delete S3 namespace
      await this.s3Manager.deleteTenantNamespace(tenantId);
      
      // Delete tenant record (cascade will handle related data)
      const { error } = await this.supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);
      
      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new TenantError(
        `Failed to delete tenant: ${error.message}`,
        'TENANT_DELETION_FAILED',
        500
      );
    }
  }

  // ============================================================================
  // TENANT CONTEXT MANAGEMENT
  // ============================================================================

  /**
   * Set tenant context for RLS
   */
  async setTenantContext(tenantId: string): Promise<void> {
    const { error } = await this.supabase.rpc('set_current_tenant', {
      tenant_uuid: tenantId
    });
    
    if (error) {
      throw new TenantError('Failed to set tenant context', 'CONTEXT_SET_FAILED');
    }
  }

  /**
   * Get current tenant context
   */
  async getCurrentTenantContext(): Promise<string | null> {
    const { data, error } = await this.supabase.rpc('get_current_tenant');
    
    if (error) {
      return null;
    }
    
    return data;
  }

  /**
   * Validate tenant access for user
   */
  async validateTenantAccess(userId: string, tenantId: string): Promise<boolean> {
    // Implementation depends on your auth system
    // This is a placeholder for access control logic
    return true;
  }

  // ============================================================================
  // AI ASSISTANT MANAGEMENT
  // ============================================================================

  /**
   * Create AI assistant for tenant
   */
  async createAssistant(tenantId: string, data: CreateAssistantRequest): Promise<AIAssistant> {
    await this.setTenantContext(tenantId);
    
    const assistantData = {
      tenant_id: tenantId,
      name: data.name,
      description: data.description,
      config: data.config || this.getDefaultAIConfig(),
      sales_config: data.salesConfig || this.getDefaultSalesConfig(),
      integrations: {},
      knowledge_base: {
        auto_learning: true,
        sources: [],
        last_training: null
      },
      status: 'active'
    };
    
    const { data: assistant, error } = await this.supabase
      .from('ai_assistants')
      .insert(assistantData)
      .select()
      .single();
    
    if (error) {
      throw new TenantError('Failed to create AI assistant', 'ASSISTANT_CREATION_FAILED');
    }
    
    return this.mapDatabaseToAssistant(assistant);
  }

  /**
   * Get tenant's AI assistants
   */
  async getTenantAssistants(tenantId: string): Promise<AIAssistant[]> {
    await this.setTenantContext(tenantId);
    
    const { data, error } = await this.supabase
      .from('ai_assistants')
      .select('*')
      .eq('tenant_id', tenantId);
    
    if (error) {
      throw new TenantError('Failed to fetch assistants', 'ASSISTANTS_FETCH_FAILED');
    }
    
    return data.map(this.mapDatabaseToAssistant);
  }

  // ============================================================================
  // TENANT ANALYTICS
  // ============================================================================

  /**
   * Get tenant usage statistics
   */
  async getTenantUsage(tenantId: string, dateFrom: Date, dateTo: Date) {
    await this.setTenantContext(tenantId);
    
    const { data, error } = await this.supabase
      .from('sales_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('metric_date', dateFrom.toISOString().split('T')[0])
      .lte('metric_date', dateTo.toISOString().split('T')[0])
      .order('metric_date');
    
    if (error) {
      throw new TenantError('Failed to fetch usage data', 'USAGE_FETCH_FAILED');
    }
    
    return data;
  }

  /**
   * Check tenant limits
   */
  async checkTenantLimits(tenantId: string): Promise<{
    withinLimits: boolean;
    usage: Record<string, number>;
    limits: IntegrationLimits;
    warnings: string[];
  }> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new TenantError('Tenant not found', 'TENANT_NOT_FOUND', 404);
    }
    
    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const usage = await this.getTenantUsage(tenantId, startOfMonth, new Date());
    const totalMessages = usage.reduce((sum, day) => sum + day.total_messages, 0);
    
    const warnings = [];
    const limits = tenant.integrationLimits;
    
    // Check message limits
    if (totalMessages >= limits.monthlyMessages * 0.9) {
      warnings.push('Approaching monthly message limit');
    }
    
    return {
      withinLimits: totalMessages <= limits.monthlyMessages,
      usage: { messages: totalMessages },
      limits,
      warnings
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async validateTenantData(data: CreateTenantRequest): Promise<void> {
    // Check if slug is unique
    const existing = await this.getTenantByIdentifier(data.slug);
    if (existing) {
      throw new TenantError('Tenant slug already exists', 'SLUG_EXISTS', 409);
    }
    
    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(data.slug)) {
      throw new TenantError('Invalid slug format', 'INVALID_SLUG', 400);
    }
  }

  private async createTenantRecord(data: CreateTenantRequest): Promise<Tenant> {
    const tenantData = {
      name: data.name,
      domain: data.domain,
      slug: data.slug,
      plan: data.plan || 'starter',
      sales_config: data.salesConfig || this.getDefaultSalesConfig(),
      integration_limits: this.getIntegrationLimits(data.plan || 'starter'),
      subscription_status: 'trial'
    };
    
    const { data: tenant, error } = await this.supabase
      .from('tenants')
      .insert(tenantData)
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return this.mapDatabaseToTenant(tenant);
  }

  private async setupTenantInfrastructure(tenantId: string): Promise<void> {
    // Create S3 namespace for tenant
    await this.s3Manager.createTenantNamespace(tenantId);
    
    // Set up RLS policies
    await this.setTenantContext(tenantId);
  }

  private async createDefaultSalesAssistant(tenantId: string): Promise<void> {
    const defaultAssistant: CreateAssistantRequest = {
      name: 'SalesFlow Assistant',
      description: 'Default AI assistant for sales automation',
      config: this.getDefaultAIConfig(),
      salesConfig: {
        leadQualificationEnabled: true,
        emotionalAnalysisEnabled: true,
        competitorDetectionEnabled: false,
        predictiveInsightsEnabled: false
      }
    };
    
    await this.createAssistant(tenantId, defaultAssistant);
  }

  private async initializeSalesMetrics(tenantId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    const metricsData = {
      tenant_id: tenantId,
      metric_date: today,
      total_conversations: 0,
      total_messages: 0,
      unique_customers: 0,
      leads_generated: 0,
      leads_qualified: 0,
      deals_created: 0,
      deals_won: 0,
      total_deal_value: 0,
      ai_accuracy_score: 0,
      emotional_analysis_accuracy: 0,
      auto_resolution_rate: 0
    };
    
    await this.supabase
      .from('sales_metrics')
      .insert(metricsData);
  }

  private getDefaultSalesConfig(): SalesConfig {
    return {
      targetAudience: 'SMB',
      averageDealSize: 50000,
      salesCycleDays: 30,
      timezone: 'Europe/Moscow',
      currency: 'RUB',
      aiFeatures: {
        businessCoachEnabled: false,
        emotionalAnalysisEnabled: true,
        predictiveInsightsEnabled: false,
        competitorDetectionEnabled: false,
        psychologicalProfilingEnabled: false
      }
    };
  }

  private getDefaultAIConfig() {
    return {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000,
      personality: 'professional',
      systemPrompt: 'You are a helpful sales assistant focused on customer service and lead qualification.',
      confidenceThreshold: 0.8
    };
  }

  private getIntegrationLimits(plan: string): IntegrationLimits {
    const limitsMap = {
      starter: {
        crmConnections: 1,
        messengerBots: 1,
        monthlyMessages: 2000,
        knowledgeBaseMb: 50,
        ecommerceIntegrations: 0
      },
      business: {
        crmConnections: 3,
        messengerBots: 3,
        monthlyMessages: 20000,
        knowledgeBaseMb: 500,
        ecommerceIntegrations: 2
      },
      enterprise: {
        crmConnections: 10,
        messengerBots: 10,
        monthlyMessages: 200000,
        knowledgeBaseMb: 5000,
        ecommerceIntegrations: 10
      },
      custom: {
        crmConnections: 999,
        messengerBots: 999,
        monthlyMessages: 999999,
        knowledgeBaseMb: 50000,
        ecommerceIntegrations: 999
      }
    };
    
    return limitsMap[plan] || limitsMap.starter;
  }

  private mapDatabaseToTenant(data: any): Tenant {
    return {
      id: data.id,
      name: data.name,
      domain: data.domain,
      slug: data.slug,
      plan: data.plan,
      salesConfig: data.sales_config || {},
      integrationLimits: data.integration_limits || {},
      subscriptionStatus: data.subscription_status,
      subscriptionEndsAt: data.subscription_ends_at ? new Date(data.subscription_ends_at) : null,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  private mapDatabaseToAssistant(data: any): AIAssistant {
    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      description: data.description,
      config: data.config,
      salesConfig: data.sales_config,
      integrations: data.integrations,
      knowledgeBase: data.knowledge_base,
      status: data.status,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }
}

// ============================================================================
// TENANT CONTEXT UTILITIES
// ============================================================================

export class TenantContext {
  private static instance: TenantContext;
  private currentTenantId: string | null = null;
  private tenantManager: TenantManager;
  
  constructor(tenantManager: TenantManager) {
    this.tenantManager = tenantManager;
  }
  
  static getInstance(tenantManager?: TenantManager): TenantContext {
    if (!TenantContext.instance && tenantManager) {
      TenantContext.instance = new TenantContext(tenantManager);
    }
    return TenantContext.instance;
  }
  
  async setCurrentTenant(tenantId: string): Promise<void> {
    await this.tenantManager.setTenantContext(tenantId);
    this.currentTenantId = tenantId;
  }
  
  getCurrentTenantId(): string | null {
    return this.currentTenantId;
  }
  
  async requireTenantContext(): Promise<string> {
    if (!this.currentTenantId) {
      throw new TenantError('Tenant context required', 'NO_TENANT_CONTEXT', 401);
    }
    return this.currentTenantId;
  }
}

export default TenantManager;