/**
 * Authentication System for SalesFlow AI 2.0
 * Complete auth system with sales-specific roles and permissions
 */

// Export main classes
export { AuthManager } from './auth-manager';

// Export all types
export * from './types';

// Re-export commonly used interfaces
export type {
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
  SecurityEvent
} from './types';

// Export role definitions
export const SALES_ROLES: Record<string, { name: string; description: string }> = {
  owner: {
    name: 'Владелец',
    description: 'Полный доступ ко всем функциям, включая биллинг и управление аккаунтом'
  },
  admin: {
    name: 'Администратор',
    description: 'Полный доступ ко всем функциям, кроме биллинга'
  },
  sales_manager: {
    name: 'Руководитель продаж',
    description: 'Управление командой и доступ ко всем сделкам'
  },
  sales_rep: {
    name: 'Менеджер по продажам',
    description: 'Работа с собственными сделками и назначенными лидами'
  },
  support: {
    name: 'Поддержка',
    description: 'Работа с клиентами и ограниченный доступ к продажам'
  },
  viewer: {
    name: 'Наблюдатель',
    description: 'Только просмотр отчетов и аналитики'
  },
  guest: {
    name: 'Гость',
    description: 'Очень ограниченный временный доступ'
  }
};

// Export permission groups
export const PERMISSION_GROUPS = {
  user_management: {
    name: 'Управление пользователями',
    permissions: ['users:create', 'users:read', 'users:update', 'users:delete', 'users:invite']
  },
  tenant_management: {
    name: 'Управление аккаунтом',
    permissions: ['tenant:update', 'tenant:billing', 'tenant:integrations', 'tenant:delete']
  },
  sales_data: {
    name: 'Данные продаж',
    permissions: [
      'deals:create', 'deals:read', 'deals:read_all', 'deals:update', 'deals:delete',
      'leads:create', 'leads:read', 'leads:read_all', 'leads:update', 'leads:delete', 'leads:assign'
    ]
  },
  customer_data: {
    name: 'Данные клиентов',
    permissions: ['customers:create', 'customers:read', 'customers:read_all', 'customers:update', 'customers:delete']
  },
  ai_features: {
    name: 'AI функции',
    permissions: ['ai:chat', 'ai:insights']
  },
  knowledge_base: {
    name: 'База знаний',
    permissions: ['knowledge:create', 'knowledge:read', 'knowledge:update', 'knowledge:delete']
  },
  analytics: {
    name: 'Аналитика',
    permissions: ['analytics:view', 'analytics:export', 'reports:create', 'reports:share']
  },
  integrations: {
    name: 'Интеграции',
    permissions: ['integrations:create', 'integrations:update', 'integrations:delete', 'integrations:view']
  },
  system: {
    name: 'Система',
    permissions: ['system:logs', 'system:audit', 'system:settings']
  }
};

// Default auth configuration
export const DEFAULT_AUTH_CONFIG = {
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: '24h',
  refreshTokenExpiresIn: '30d',
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
    maxAge: 90, // days
    preventReuse: 5 // last N passwords
  },
  sessionPolicy: {
    maxConcurrentSessions: 5,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours in ms
    extendOnActivity: true
  },
  securityPolicy: {
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes in ms
    requireTwoFactor: false,
    allowSocialLogin: true
  }
};