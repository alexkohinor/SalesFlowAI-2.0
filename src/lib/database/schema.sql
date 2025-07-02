-- SalesFlow AI 2.0 Multi-tenant Database Schema
-- Based on Lawer architecture with sales-specific extensions

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE TENANT SYSTEM (from Lawer)
-- ============================================================================

-- Main tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'starter',
    
    -- SalesFlow AI specific fields
    sales_config JSONB DEFAULT '{}',
    integration_limits JSONB DEFAULT '{
        "crm_connections": 1,
        "messenger_bots": 1,
        "monthly_messages": 2000,
        "knowledge_base_mb": 50
    }',
    
    -- Subscription and limits
    subscription_status VARCHAR(20) DEFAULT 'trial',
    subscription_ends_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_plan CHECK (plan IN ('starter', 'business', 'enterprise', 'custom')),
    CONSTRAINT valid_subscription_status CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled'))
);

-- Add indexes
CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_subscription_status ON tenants(subscription_status);

-- ============================================================================
-- AI ASSISTANTS (adapted from Lawer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_assistants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- AI Configuration
    config JSONB NOT NULL DEFAULT '{
        "model": "gpt-4",
        "temperature": 0.7,
        "max_tokens": 1000,
        "personality": "professional"
    }',
    
    -- SalesFlow AI specific config
    sales_config JSONB DEFAULT '{
        "lead_qualification_enabled": true,
        "emotional_analysis_enabled": true,
        "competitor_detection_enabled": false,
        "predictive_insights_enabled": false
    }',
    
    -- Integration settings
    integrations JSONB DEFAULT '{}',
    
    -- Knowledge base settings
    knowledge_base JSONB DEFAULT '{
        "auto_learning": true,
        "sources": [],
        "last_training": null
    }',
    
    -- Status and metadata
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'training', 'inactive'))
);

-- Enable RLS on ai_assistants
ALTER TABLE ai_assistants ENABLE ROW LEVEL SECURITY;

-- RLS Policy for tenant isolation
CREATE POLICY tenant_isolation_ai_assistants ON ai_assistants
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_ai_assistants_tenant_id ON ai_assistants(tenant_id);
CREATE INDEX idx_ai_assistants_status ON ai_assistants(status);

-- ============================================================================
-- CONVERSATIONS & MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id UUID REFERENCES ai_assistants(id) ON DELETE CASCADE,
    
    -- Customer information
    customer_id VARCHAR(255), -- External customer ID from CRM/messenger
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(255),
    
    -- Conversation metadata
    channel VARCHAR(50) NOT NULL, -- 'telegram', 'whatsapp', 'web', etc.
    channel_conversation_id VARCHAR(255), -- ID in external system
    
    -- Sales context (SalesFlow AI specific)
    sales_stage VARCHAR(50) DEFAULT 'initial_contact',
    lead_score INTEGER DEFAULT 0,
    deal_probability INTEGER DEFAULT 0,
    estimated_deal_value DECIMAL(10,2),
    
    -- Conversation status
    status VARCHAR(20) DEFAULT 'active',
    escalated BOOLEAN DEFAULT FALSE,
    escalated_at TIMESTAMP,
    
    -- Timestamps
    started_at TIMESTAMP DEFAULT NOW(),
    last_message_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    
    CONSTRAINT valid_channel CHECK (channel IN ('telegram', 'whatsapp', 'web', 'facebook', 'vk')),
    CONSTRAINT valid_conversation_status CHECK (status IN ('active', 'paused', 'completed', 'escalated')),
    CONSTRAINT valid_sales_stage CHECK (sales_stage IN ('initial_contact', 'qualification', 'proposal', 'negotiation', 'closing', 'won', 'lost'))
);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_conversations ON conversations
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX idx_conversations_assistant_id ON conversations(assistant_id);
CREATE INDEX idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_sales_stage ON conversations(sales_stage);

-- ============================================================================
-- MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Message content
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    
    -- Message direction
    direction VARCHAR(10) NOT NULL, -- 'inbound' or 'outbound'
    sender_type VARCHAR(20) NOT NULL, -- 'customer' or 'assistant' or 'human'
    
    -- External message data
    external_message_id VARCHAR(255),
    external_data JSONB DEFAULT '{}',
    
    -- AI Analysis (SalesFlow AI specific)
    ai_analysis JSONB DEFAULT '{
        "sentiment": null,
        "emotions": {},
        "intent": null,
        "entities": [],
        "confidence": 0
    }',
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_message_type CHECK (message_type IN ('text', 'image', 'document', 'audio', 'video')),
    CONSTRAINT valid_direction CHECK (direction IN ('inbound', 'outbound')),
    CONSTRAINT valid_sender_type CHECK (sender_type IN ('customer', 'assistant', 'human'))
);

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_messages ON messages
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================================================
-- KNOWLEDGE BASE (adapted from Lawer RAG system)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Document metadata
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    document_type VARCHAR(50) DEFAULT 'general',
    
    -- SalesFlow AI specific types
    sales_category VARCHAR(50), -- 'product_catalog', 'sales_scripts', 'competitor_analysis', 'pricing'
    
    -- File information
    file_name VARCHAR(255),
    file_size INTEGER,
    file_type VARCHAR(50),
    file_url TEXT,
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    vectorized BOOLEAN DEFAULT FALSE,
    processing_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_document_type CHECK (document_type IN ('general', 'faq', 'manual', 'product', 'policy')),
    CONSTRAINT valid_sales_category CHECK (sales_category IN ('product_catalog', 'sales_scripts', 'competitor_analysis', 'pricing', 'objection_handling'))
);

-- Enable RLS
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_knowledge_documents ON knowledge_documents
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_knowledge_documents_tenant_id ON knowledge_documents(tenant_id);
CREATE INDEX idx_knowledge_documents_type ON knowledge_documents(document_type);
CREATE INDEX idx_knowledge_documents_sales_category ON knowledge_documents(sales_category);

-- ============================================================================
-- INTEGRATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Integration details
    integration_type VARCHAR(50) NOT NULL,
    integration_name VARCHAR(255) NOT NULL,
    
    -- Configuration (encrypted)
    config JSONB NOT NULL DEFAULT '{}',
    credentials JSONB NOT NULL DEFAULT '{}', -- Encrypted credentials
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    last_sync_at TIMESTAMP,
    sync_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_integration_type CHECK (integration_type IN (
        'amocrm', 'bitrix24', 'hubspot', 'pipedrive',
        'telegram', 'whatsapp', 'vk', 'facebook',
        'wildberries', 'ozon', 'avito'
    )),
    CONSTRAINT valid_integration_status CHECK (status IN ('active', 'inactive', 'error', 'pending'))
);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_integrations ON integrations
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_integrations_tenant_id ON integrations(tenant_id);
CREATE INDEX idx_integrations_type ON integrations(integration_type);
CREATE INDEX idx_integrations_status ON integrations(status);

-- ============================================================================
-- SALES ANALYTICS (SalesFlow AI specific)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Metric data
    metric_date DATE NOT NULL,
    
    -- Basic metrics
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    
    -- Sales metrics
    leads_generated INTEGER DEFAULT 0,
    leads_qualified INTEGER DEFAULT 0,
    deals_created INTEGER DEFAULT 0,
    deals_won INTEGER DEFAULT 0,
    total_deal_value DECIMAL(12,2) DEFAULT 0,
    
    -- AI metrics
    ai_accuracy_score DECIMAL(5,2) DEFAULT 0,
    emotional_analysis_accuracy DECIMAL(5,2) DEFAULT 0,
    auto_resolution_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(tenant_id, metric_date)
);

-- Enable RLS
ALTER TABLE sales_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sales_metrics ON sales_metrics
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_sales_metrics_tenant_id ON sales_metrics(tenant_id);
CREATE INDEX idx_sales_metrics_date ON sales_metrics(metric_date);

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function to set current tenant context
CREATE OR REPLACE FUNCTION set_current_tenant(tenant_uuid UUID)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', tenant_uuid::text, true);
END;
$$ LANGUAGE plpgsql;

-- Function to get current tenant
CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id')::uuid;
EXCEPTION
    WHEN others THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_assistants_updated_at BEFORE UPDATE ON ai_assistants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_documents_updated_at BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_metrics_updated_at BEFORE UPDATE ON sales_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA FOR DEVELOPMENT
-- ============================================================================

-- Insert sample tenant (for development only)
INSERT INTO tenants (id, name, domain, slug, plan, sales_config) VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'Demo SalesFlow Company',
    'demo.salesflow.ai',
    'demo-company',
    'business',
    '{
        "target_audience": "SMB e-commerce",
        "average_deal_size": 50000,
        "sales_cycle_days": 30,
        "timezone": "Europe/Moscow"
    }'
) ON CONFLICT (slug) DO NOTHING;

-- Sample AI assistant
INSERT INTO ai_assistants (tenant_id, name, description, sales_config) VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'SalesFlow Demo Assistant',
    'Demo AI assistant for sales automation',
    '{
        "lead_qualification_enabled": true,
        "emotional_analysis_enabled": true,
        "competitor_detection_enabled": true,
        "predictive_insights_enabled": true
    }'
) ON CONFLICT DO NOTHING;