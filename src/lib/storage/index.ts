/**
 * Storage Module for SalesFlow AI 2.0
 * S3-based storage with namespace isolation based on Lawer architecture
 */

// Export main S3 manager
export { default as S3Manager } from './s3-manager';

// Export storage types and interfaces
export type {
  S3Config,
  UploadFileRequest,
  UploadedFile,
  FileListItem,
  StorageCategory
} from './s3-manager';

// Storage utilities
export { 
  generateSecureFileName,
  validateFileType,
  calculateStorageQuota,
  getStorageUsageByCategory
} from './utils';

// Storage configuration helpers
export { createS3Config, validateS3Config } from './config';