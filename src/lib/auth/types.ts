/**
 * Authentication System Types for SalesFlow AI 2.0
 * Enhanced with sales-specific roles and permissions
 */

// ============================================================================
// CORE AUTH TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  
  // Sales-specific fields
  jobTitle?: string;
  department?: string;
  salesQuota?: number;
  salesRegion?: string;
  
  // Account status
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  isOnline: boolean;
  lastLoginAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  
  // Preferences
  preferences: UserPreferences;
  
  // Current tenant context
  currentTenantId?: string;
}

export interface UserPreferences {
  language: 'ru' | 'en';
  timezone: string;
  currency: 'RUB' | 'USD' | 'EUR';
  
  // UI preferences
  theme: 'light' | 'dark' | 'auto';
  sidebarCollapsed: boolean;
  dashboardLayout: 'compact' | 'comfortable' | 'spacious';
  
  // Notification preferences
  notifications: {
    email: {
      newLeads: boolean;
      dealUpdates: boolean;
      systemUpdates: boolean;
      weeklyReports: boolean;
    };
    push: {
      urgentMessages: boolean;
      meetingReminders: boolean;
      dealDeadlines: boolean;
    };
    inApp: {
      aiInsights: boolean;
      competitorUpdates: boolean;
      teamActivity: boolean;
    };
  };
  
  // Sales preferences
  sales: {
    defaultPipeline?: string;
    autoAssignLeads: boolean;
    preferredCommunicationChannels: string[];
    workingHours: {
      timezone: string;
      start: string; // HH:MM
      end: string; // HH:MM
      workDays: number[]; // 0-6, Sunday = 0
    };
  };
}

// ============================================================================
// ROLES AND PERMISSIONS
// ============================================================================

export type SalesRole = 
  | 'owner'          // Full access, billing, user management
  | 'admin'          // Full access except billing
  | 'sales_manager'  // Manage team, view all deals
  | 'sales_rep'      // Manage own deals and assigned leads
  | 'support'        // Handle customer support, limited sales access
  | 'viewer'         // Read-only access to reports and analytics
  | 'guest';         // Limited temporary access

export type Permission = 
  // User management
  | 'users:create'
  | 'users:read'
  | 'users:update'
  | 'users:delete'
  | 'users:invite'
  
  // Tenant management
  | 'tenant:update'
  | 'tenant:billing'
  | 'tenant:integrations'
  | 'tenant:delete'
  
  // Sales data
  | 'deals:create'
  | 'deals:read'
  | 'deals:read_all'
  | 'deals:update'
  | 'deals:delete'
  | 'leads:create'
  | 'leads:read'
  | 'leads:read_all'
  | 'leads:update'
  | 'leads:delete'
  | 'leads:assign'
  
  // Customer data
  | 'customers:create'
  | 'customers:read'
  | 'customers:read_all'
  | 'customers:update'
  | 'customers:delete'
  
  // AI and Knowledge
  | 'ai:chat'
  | 'ai:insights'
  | 'knowledge:create'
  | 'knowledge:read'
  | 'knowledge:update'
  | 'knowledge:delete'
  
  // Analytics and Reports
  | 'analytics:view'
  | 'analytics:export'
  | 'reports:create'
  | 'reports:share'
  
  // Integrations
  | 'integrations:create'
  | 'integrations:update'
  | 'integrations:delete'
  | 'integrations:view'
  
  // System
  | 'system:logs'
  | 'system:audit'
  | 'system:settings';

export interface RoleDefinition {
  role: SalesRole;
  permissions: Permission[];
  description: string;
  isCustomizable: boolean;
}

export interface UserRole {
  userId: string;
  tenantId: string;
  role: SalesRole;
  customPermissions?: Permission[];
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date;
}

// ============================================================================
// TENANT MEMBERSHIP
// ============================================================================

export interface TenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  role: SalesRole;
  
  // Sales-specific metadata
  salesTarget?: number;
  commissionRate?: number;
  territory?: string;
  teamId?: string;
  
  // Membership status
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  lastActiveAt?: Date;
  
  // Access control
  customPermissions?: Permission[];
  restrictions?: {
    allowedHours?: { start: string; end: string };
    allowedDays?: number[];
    ipWhitelist?: string[];
    maxSessions?: number;
  };
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export interface AuthSession {
  id: string;
  userId: string;
  tenantId?: string;
  
  // Session data
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  
  // Device/Client info
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  location?: {
    country?: string;
    city?: string;
    timezone?: string;
  };
  
  // Session metadata
  createdAt: Date;
  lastUsedAt: Date;
  isActive: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  tenantId?: string;
  remember?: boolean;
  deviceId?: string;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  session?: AuthSession;
  tenantMemberships?: TenantMembership[];
  requiresTwoFactor?: boolean;
  error?: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  jobTitle?: string;
  phone?: string;
  
  // Marketing
  source?: string;
  referralCode?: string;
  agreedToTerms: boolean;
  agreedToMarketing: boolean;
}

export interface SignupResult {
  success: boolean;
  user?: User;
  tenant?: any; // TenantBasic from tenant types
  session?: AuthSession;
  requiresEmailVerification?: boolean;
  error?: string;
}

// ============================================================================
// OAUTH AND SOCIAL LOGIN
// ============================================================================

export type OAuthProvider = 
  | 'google'
  | 'microsoft'
  | 'github'
  | 'yandex'
  | 'vk';

export interface OAuthCredentials {
  provider: OAuthProvider;
  code: string;
  state?: string;
  redirectUri: string;
  tenantId?: string;
}

export interface OAuthProfile {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  
  // Provider-specific data
  raw: Record<string, any>;
}

export interface ConnectedAccount {
  id: string;
  userId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
  
  // Account data
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string[];
  
  // Metadata
  connectedAt: Date;
  lastUsedAt?: Date;
  isActive: boolean;
}

// ============================================================================
// TWO-FACTOR AUTHENTICATION
// ============================================================================

export interface TwoFactorSetup {
  userId: string;
  secret: string;
  qrCode: string;
  backupCodes: string[];
  isEnabled: boolean;
}

export interface TwoFactorVerification {
  userId: string;
  code: string;
  backupCode?: boolean;
}

// ============================================================================
// INVITATIONS
// ============================================================================

export interface UserInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: SalesRole;
  
  // Invitation metadata
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  
  // Status
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  acceptedAt?: Date;
  
  // Custom message
  message?: string;
  
  // Sales-specific
  assignedTeam?: string;
  territory?: string;
  salesTarget?: number;
}

export interface InvitationAcceptance {
  invitationId: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  jobTitle?: string;
}

// ============================================================================
// PASSWORD AND SECURITY
// ============================================================================

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge?: number; // days
  preventReuse?: number; // last N passwords
}

export interface PasswordResetRequest {
  email: string;
  tenantId?: string;
}

export interface PasswordReset {
  token: string;
  newPassword: string;
}

export interface SecurityEvent {
  id: string;
  userId: string;
  tenantId?: string;
  
  type: 'login_success' | 'login_failed' | 'password_changed' | 
        'two_factor_enabled' | 'two_factor_disabled' | 'account_locked' |
        'suspicious_activity' | 'data_export' | 'permission_changed';
  
  details: Record<string, any>;
  
  // Context
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  
  // Metadata
  createdAt: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// API KEYS AND TOKENS
// ============================================================================

export interface ApiKey {
  id: string;
  name: string;
  userId: string;
  tenantId: string;
  
  // Key data
  keyHash: string; // Hashed version for storage
  keyPrefix: string; // First few chars for identification
  
  // Permissions
  permissions: Permission[];
  restrictions?: {
    ipWhitelist?: string[];
    allowedOrigins?: string[];
    rateLimit?: number;
  };
  
  // Metadata
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface PersonalAccessToken {
  id: string;
  name: string;
  userId: string;
  tenantId?: string;
  
  // Token data
  tokenHash: string;
  tokenPrefix: string;
  
  // Scope
  scopes: string[];
  
  // Metadata
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class PermissionDeniedError extends AuthError {
  constructor(
    permission: string,
    resource?: string
  ) {
    super(
      `Permission denied: ${permission}${resource ? ` on ${resource}` : ''}`,
      'PERMISSION_DENIED',
      403
    );
  }
}

export class SessionExpiredError extends AuthError {
  constructor() {
    super('Session has expired', 'SESSION_EXPIRED', 401);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Invalid credentials', 'INVALID_CREDENTIALS', 401);
  }
}

export class AccountLockedError extends AuthError {
  constructor(unlockAt?: Date) {
    super(
      `Account is locked${unlockAt ? ` until ${unlockAt.toISOString()}` : ''}`,
      'ACCOUNT_LOCKED',
      423
    );
  }
}

export class TwoFactorRequiredError extends AuthError {
  constructor() {
    super('Two-factor authentication required', 'TWO_FACTOR_REQUIRED', 428);
  }
}