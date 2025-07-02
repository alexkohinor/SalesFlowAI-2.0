/**
 * Tenant Management Module for SalesFlow AI 2.0
 * Based on Lawer architecture with sales-specific extensions
 */

// Export main tenant manager
export { default as TenantManager, TenantContext } from './tenant-manager';

// Export all tenant-related types
export * from '@/types/tenant';

// Utility functions for tenant operations
export { validateSlug, generateTenantSlug } from './utils';

// Middleware for tenant context
export { withTenantContext, requireTenantAccess } from './middleware';

// Constants and configurations
export * from './constants';