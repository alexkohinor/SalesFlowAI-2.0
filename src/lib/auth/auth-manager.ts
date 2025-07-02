/**
 * Authentication Manager for SalesFlow AI 2.0
 * Comprehensive auth system with sales-specific features
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import {
  User,
  AuthSession,
  LoginCredentials,
  LoginResult,
  SignupCredentials,
  SignupResult,
  TenantMembership,
  SalesRole,
  Permission,
  UserInvitation,
  OAuthCredentials,
  OAuthProfile,
  TwoFactorSetup,
  SecurityEvent,
  AuthError,
  InvalidCredentialsError,
  AccountLockedError,
  SessionExpiredError,
  PermissionDeniedError
} from './types';

import { TenantManager } from '@/lib/tenant-management';

// ============================================================================
// AUTH MANAGER CLASS
// ============================================================================

export class AuthManager {
  private supabase: any;
  private tenantManager: TenantManager;
  private jwtSecret: string;
  private jwtExpiresIn: string;

  constructor(
    supabaseClient: any,
    tenantManager: TenantManager,
    options: {
      jwtSecret: string;
      jwtExpiresIn?: string;
    }
  ) {
    this.supabase = supabaseClient;
    this.tenantManager = tenantManager;
    this.jwtSecret = options.jwtSecret;
    this.jwtExpiresIn = options.jwtExpiresIn || '24h';
  }

  // ============================================================================
  // AUTHENTICATION METHODS
  // ============================================================================

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    try {
      // Find user by email
      const { data: userData, error: userError } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', credentials.email.toLowerCase())
        .single();

      if (userError || !userData) {
        await this.logSecurityEvent(null, 'login_failed', {
          email: credentials.email,
          reason: 'user_not_found'
        });
        throw new InvalidCredentialsError();
      }

      const user = this.mapDatabaseToUser(userData);

      // Check if account is active
      if (!user.isActive) {
        await this.logSecurityEvent(user.id, 'login_failed', {
          reason: 'account_inactive'
        });
        throw new AccountLockedError();
      }

      // Verify password
      const passwordValid = await bcrypt.compare(credentials.password, userData.password_hash);
      if (!passwordValid) {
        await this.logSecurityEvent(user.id, 'login_failed', {
          reason: 'invalid_password'
        });
        throw new InvalidCredentialsError();
      }

      // Get tenant memberships
      const tenantMemberships = await this.getUserTenantMemberships(user.id);

      // If tenantId specified, validate membership
      let targetTenantId = credentials.tenantId;
      if (targetTenantId) {
        const membership = tenantMemberships.find(m => m.tenantId === targetTenantId);
        if (!membership || membership.status !== 'active') {
          throw new PermissionDeniedError('access', 'tenant');
        }
      } else if (tenantMemberships.length > 0) {
        // Use first active membership as default
        const activeMembership = tenantMemberships.find(m => m.status === 'active');
        targetTenantId = activeMembership?.tenantId;
      }

      // Create session
      const session = await this.createSession(user.id, targetTenantId, credentials);

      // Update last login
      await this.updateLastLogin(user.id);

      // Log successful login
      await this.logSecurityEvent(user.id, 'login_success', {
        tenantId: targetTenantId,
        sessionId: session.id
      });

      return {
        success: true,
        user: { ...user, currentTenantId: targetTenantId },
        session,
        tenantMemberships
      };

    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(`Login failed: ${error.message}`, 'LOGIN_FAILED');
    }
  }

  /**
   * Register new user and create tenant
   */
  async signup(credentials: SignupCredentials): Promise<SignupResult> {
    try {
      // Check if user already exists
      const { data: existingUser } = await this.supabase
        .from('users')
        .select('id')
        .eq('email', credentials.email.toLowerCase())
        .single();

      if (existingUser) {
        throw new AuthError('User already exists', 'USER_EXISTS', 409);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(credentials.password, 12);

      // Create user
      const { data: userData, error: userError } = await this.supabase
        .from('users')
        .insert({
          email: credentials.email.toLowerCase(),
          password_hash: passwordHash,
          first_name: credentials.firstName,
          last_name: credentials.lastName,
          job_title: credentials.jobTitle,
          phone: credentials.phone,
          email_verified: false,
          is_active: true,
          preferences: this.getDefaultUserPreferences()
        })
        .select()
        .single();

      if (userError) {
        throw new Error(userError.message);
      }

      const user = this.mapDatabaseToUser(userData);

      // Create tenant if company name provided
      let tenant = null;
      if (credentials.companyName) {
        tenant = await this.tenantManager.createTenant({
          name: credentials.companyName,
          ownerUserId: user.id,
          plan: 'starter',
          industry: 'other'
        });

        // Add user as owner to tenant
        await this.addTenantMembership({
          userId: user.id,
          tenantId: tenant.id,
          role: 'owner',
          assignedBy: user.id
        });
      }

      // Create session
      const session = await this.createSession(user.id, tenant?.id);

      return {
        success: true,
        user: { ...user, currentTenantId: tenant?.id },
        tenant,
        session,
        requiresEmailVerification: true
      };

    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(`Signup failed: ${error.message}`, 'SIGNUP_FAILED');
    }
  }

  /**
   * Login with OAuth provider
   */
  async loginWithOAuth(credentials: OAuthCredentials): Promise<LoginResult> {
    try {
      // Get OAuth profile from provider
      const profile = await this.getOAuthProfile(credentials);

      // Find or create user
      let user = await this.findUserByEmail(profile.email);
      
      if (!user) {
        // Create new user from OAuth profile
        user = await this.createUserFromOAuth(profile);
      }

      // Update/create connected account
      await this.updateConnectedAccount(user.id, profile, credentials);

      // Get tenant memberships
      const tenantMemberships = await this.getUserTenantMemberships(user.id);

      // Create session
      const session = await this.createSession(user.id, credentials.tenantId);

      return {
        success: true,
        user,
        session,
        tenantMemberships
      };

    } catch (error) {
      throw new AuthError(`OAuth login failed: ${error.message}`, 'OAUTH_LOGIN_FAILED');
    }
  }

  /**
   * Logout and invalidate session
   */
  async logout(sessionId: string): Promise<void> {
    try {
      // Invalidate session
      await this.supabase
        .from('auth_sessions')
        .update({ is_active: false })
        .eq('id', sessionId);

      // Log logout
      const session = await this.getSession(sessionId);
      if (session) {
        await this.logSecurityEvent(session.userId, 'logout', {
          sessionId
        });
      }

    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Create new authentication session
   */
  private async createSession(
    userId: string,
    tenantId?: string,
    credentials?: Partial<LoginCredentials>
  ): Promise<AuthSession> {
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    // Generate tokens
    const accessToken = this.generateAccessToken(userId, tenantId);
    const refreshToken = this.generateRefreshToken(userId);

    const { data, error } = await this.supabase
      .from('auth_sessions')
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt.toISOString(),
        device_id: credentials?.deviceId,
        user_agent: '', // TODO: Extract from request
        ip_address: '', // TODO: Extract from request
        is_active: true
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    return this.mapDatabaseToSession(data);
  }

  /**
   * Validate and get session
   */
  async validateSession(token: string): Promise<AuthSession | null> {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, this.jwtSecret) as any;

      // Get session from database
      const { data, error } = await this.supabase
        .from('auth_sessions')
        .select('*')
        .eq('access_token', token)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return null;
      }

      const session = this.mapDatabaseToSession(data);

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(session.id);
        return null;
      }

      // Update last used
      await this.updateSessionLastUsed(session.id);

      return session;

    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh access token
   */
  async refreshSession(refreshToken: string): Promise<AuthSession> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;

      const { data, error } = await this.supabase
        .from('auth_sessions')
        .select('*')
        .eq('refresh_token', refreshToken)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        throw new SessionExpiredError();
      }

      // Generate new tokens
      const newAccessToken = this.generateAccessToken(data.user_id, data.tenant_id);
      const newRefreshToken = this.generateRefreshToken(data.user_id);
      
      const expiresAt = new Date();
      expiresAt.setTime(expiresAt.getTime() + 24 * 60 * 60 * 1000);

      // Update session
      const { data: updatedData, error: updateError } = await this.supabase
        .from('auth_sessions')
        .update({
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_at: expiresAt.toISOString()
        })
        .eq('id', data.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      return this.mapDatabaseToSession(updatedData);

    } catch (error) {
      throw new SessionExpiredError();
    }
  }

  // ============================================================================
  // PERMISSION SYSTEM
  // ============================================================================

  /**
   * Check if user has permission
   */
  async hasPermission(
    userId: string,
    permission: Permission,
    tenantId?: string
  ): Promise<boolean> {
    try {
      if (!tenantId) {
        // System-level permissions (rare)
        return false;
      }

      // Get user's role in tenant
      const membership = await this.getTenantMembership(userId, tenantId);
      if (!membership || membership.status !== 'active') {
        return false;
      }

      // Get role permissions
      const rolePermissions = this.getRolePermissions(membership.role);
      
      // Check custom permissions
      const allPermissions = [
        ...rolePermissions,
        ...(membership.customPermissions || [])
      ];

      return allPermissions.includes(permission);

    } catch (error) {
      return false;
    }
  }

  /**
   * Get user's role in tenant
   */
  async getUserRole(userId: string, tenantId: string): Promise<SalesRole | null> {
    const membership = await this.getTenantMembership(userId, tenantId);
    return membership?.role || null;
  }

  /**
   * Get role permissions
   */
  private getRolePermissions(role: SalesRole): Permission[] {
    const roleDefinitions: Record<SalesRole, Permission[]> = {
      owner: [
        // Full access to everything
        'users:create', 'users:read', 'users:update', 'users:delete', 'users:invite',
        'tenant:update', 'tenant:billing', 'tenant:integrations', 'tenant:delete',
        'deals:create', 'deals:read', 'deals:read_all', 'deals:update', 'deals:delete',
        'leads:create', 'leads:read', 'leads:read_all', 'leads:update', 'leads:delete', 'leads:assign',
        'customers:create', 'customers:read', 'customers:read_all', 'customers:update', 'customers:delete',
        'ai:chat', 'ai:insights',
        'knowledge:create', 'knowledge:read', 'knowledge:update', 'knowledge:delete',
        'analytics:view', 'analytics:export', 'reports:create', 'reports:share',
        'integrations:create', 'integrations:update', 'integrations:delete', 'integrations:view',
        'system:logs', 'system:audit', 'system:settings'
      ],
      
      admin: [
        // Full access except billing and tenant deletion
        'users:create', 'users:read', 'users:update', 'users:delete', 'users:invite',
        'tenant:update', 'tenant:integrations',
        'deals:create', 'deals:read', 'deals:read_all', 'deals:update', 'deals:delete',
        'leads:create', 'leads:read', 'leads:read_all', 'leads:update', 'leads:delete', 'leads:assign',
        'customers:create', 'customers:read', 'customers:read_all', 'customers:update', 'customers:delete',
        'ai:chat', 'ai:insights',
        'knowledge:create', 'knowledge:read', 'knowledge:update', 'knowledge:delete',
        'analytics:view', 'analytics:export', 'reports:create', 'reports:share',
        'integrations:create', 'integrations:update', 'integrations:delete', 'integrations:view',
        'system:logs', 'system:audit', 'system:settings'
      ],
      
      sales_manager: [
        // Team management and full sales access
        'users:read', 'users:invite',
        'deals:create', 'deals:read', 'deals:read_all', 'deals:update',
        'leads:create', 'leads:read', 'leads:read_all', 'leads:update', 'leads:assign',
        'customers:create', 'customers:read', 'customers:read_all', 'customers:update',
        'ai:chat', 'ai:insights',
        'knowledge:read', 'knowledge:create',
        'analytics:view', 'analytics:export', 'reports:create', 'reports:share',
        'integrations:view'
      ],
      
      sales_rep: [
        // Own deals and assigned leads
        'deals:create', 'deals:read', 'deals:update',
        'leads:create', 'leads:read', 'leads:update',
        'customers:create', 'customers:read', 'customers:update',
        'ai:chat', 'ai:insights',
        'knowledge:read',
        'analytics:view', 'reports:create'
      ],
      
      support: [
        // Customer support focused
        'customers:read', 'customers:read_all', 'customers:update',
        'ai:chat',
        'knowledge:read',
        'analytics:view'
      ],
      
      viewer: [
        // Read-only access
        'deals:read', 'leads:read', 'customers:read',
        'analytics:view', 'knowledge:read'
      ],
      
      guest: [
        // Very limited access
        'analytics:view'
      ]
    };

    return roleDefinitions[role] || [];
  }

  // ============================================================================
  // TENANT MEMBERSHIP MANAGEMENT
  // ============================================================================

  /**
   * Add user to tenant
   */
  async addTenantMembership(data: {
    userId: string;
    tenantId: string;
    role: SalesRole;
    assignedBy: string;
    salesTarget?: number;
    territory?: string;
  }): Promise<TenantMembership> {
    const { data: membershipData, error } = await this.supabase
      .from('tenant_memberships')
      .insert({
        user_id: data.userId,
        tenant_id: data.tenantId,
        role: data.role,
        sales_target: data.salesTarget,
        territory: data.territory,
        status: 'active',
        invited_by: data.assignedBy,
        joined_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add tenant membership: ${error.message}`);
    }

    return this.mapDatabaseToMembership(membershipData);
  }

  /**
   * Get user's tenant memberships
   */
  async getUserTenantMemberships(userId: string): Promise<TenantMembership[]> {
    const { data, error } = await this.supabase
      .from('tenant_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      throw new Error(`Failed to get tenant memberships: ${error.message}`);
    }

    return data.map(this.mapDatabaseToMembership);
  }

  /**
   * Get specific tenant membership
   */
  async getTenantMembership(userId: string, tenantId: string): Promise<TenantMembership | null> {
    const { data, error } = await this.supabase
      .from('tenant_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) return null;
    return this.mapDatabaseToMembership(data);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private generateAccessToken(userId: string, tenantId?: string): string {
    return jwt.sign(
      { 
        userId, 
        tenantId,
        type: 'access'
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign(
      { 
        userId,
        type: 'refresh'
      },
      this.jwtSecret,
      { expiresIn: '30d' }
    );
  }

  private async getSession(sessionId: string): Promise<AuthSession | null> {
    const { data, error } = await this.supabase
      .from('auth_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) return null;
    return this.mapDatabaseToSession(data);
  }

  private async invalidateSession(sessionId: string): Promise<void> {
    await this.supabase
      .from('auth_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);
  }

  private async updateSessionLastUsed(sessionId: string): Promise<void> {
    await this.supabase
      .from('auth_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  private async updateLastLogin(userId: string): Promise<void> {
    await this.supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId);
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error) return null;
    return this.mapDatabaseToUser(data);
  }

  private async createUserFromOAuth(profile: OAuthProfile): Promise<User> {
    const { data, error } = await this.supabase
      .from('users')
      .insert({
        email: profile.email.toLowerCase(),
        first_name: profile.firstName,
        last_name: profile.lastName,
        avatar: profile.avatar,
        email_verified: true, // OAuth emails are pre-verified
        is_active: true,
        preferences: this.getDefaultUserPreferences()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user from OAuth: ${error.message}`);
    }

    return this.mapDatabaseToUser(data);
  }

  private async updateConnectedAccount(
    userId: string,
    profile: OAuthProfile,
    credentials: OAuthCredentials
  ): Promise<void> {
    // TODO: Implement connected account management
  }

  private async getOAuthProfile(credentials: OAuthCredentials): Promise<OAuthProfile> {
    // TODO: Implement OAuth profile fetching for each provider
    throw new Error('OAuth profile fetching not implemented');
  }

  private async logSecurityEvent(
    userId: string | null,
    type: SecurityEvent['type'],
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.supabase
        .from('security_events')
        .insert({
          user_id: userId,
          type,
          details,
          severity: this.getEventSeverity(type),
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  private getEventSeverity(type: SecurityEvent['type']): SecurityEvent['severity'] {
    const severityMap: Record<SecurityEvent['type'], SecurityEvent['severity']> = {
      login_success: 'low',
      login_failed: 'medium',
      password_changed: 'medium',
      two_factor_enabled: 'low',
      two_factor_disabled: 'medium',
      account_locked: 'high',
      suspicious_activity: 'high',
      data_export: 'medium',
      permission_changed: 'medium'
    };

    return severityMap[type] || 'low';
  }

  private getDefaultUserPreferences(): any {
    return {
      language: 'ru',
      timezone: 'Europe/Moscow',
      currency: 'RUB',
      theme: 'auto',
      sidebarCollapsed: false,
      dashboardLayout: 'comfortable',
      notifications: {
        email: {
          newLeads: true,
          dealUpdates: true,
          systemUpdates: false,
          weeklyReports: true
        },
        push: {
          urgentMessages: true,
          meetingReminders: true,
          dealDeadlines: true
        },
        inApp: {
          aiInsights: true,
          competitorUpdates: true,
          teamActivity: false
        }
      },
      sales: {
        autoAssignLeads: false,
        preferredCommunicationChannels: ['email', 'phone'],
        workingHours: {
          timezone: 'Europe/Moscow',
          start: '09:00',
          end: '18:00',
          workDays: [1, 2, 3, 4, 5]
        }
      }
    };
  }

  // Mapping functions
  private mapDatabaseToUser(data: any): User {
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      avatar: data.avatar,
      phone: data.phone,
      jobTitle: data.job_title,
      department: data.department,
      salesQuota: data.sales_quota,
      salesRegion: data.sales_region,
      emailVerified: data.email_verified,
      phoneVerified: data.phone_verified || false,
      isActive: data.is_active,
      isOnline: data.is_online || false,
      lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      preferences: data.preferences || this.getDefaultUserPreferences()
    };
  }

  private mapDatabaseToSession(data: any): AuthSession {
    return {
      id: data.id,
      userId: data.user_id,
      tenantId: data.tenant_id,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at),
      deviceId: data.device_id,
      deviceName: data.device_name,
      userAgent: data.user_agent,
      ipAddress: data.ip_address,
      createdAt: new Date(data.created_at),
      lastUsedAt: new Date(data.last_used_at || data.created_at),
      isActive: data.is_active
    };
  }

  private mapDatabaseToMembership(data: any): TenantMembership {
    return {
      id: data.id,
      userId: data.user_id,
      tenantId: data.tenant_id,
      role: data.role,
      salesTarget: data.sales_target,
      commissionRate: data.commission_rate,
      territory: data.territory,
      teamId: data.team_id,
      status: data.status,
      invitedBy: data.invited_by,
      invitedAt: data.invited_at ? new Date(data.invited_at) : undefined,
      joinedAt: data.joined_at ? new Date(data.joined_at) : undefined,
      lastActiveAt: data.last_active_at ? new Date(data.last_active_at) : undefined,
      customPermissions: data.custom_permissions,
      restrictions: data.restrictions,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }
}

export default AuthManager;