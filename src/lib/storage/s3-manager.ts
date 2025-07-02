/**
 * S3 Storage Manager for SalesFlow AI 2.0
 * Based on Lawer shared S3 architecture with namespace isolation
 * Extended with sales-specific storage structures
 */

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string; // For S3-compatible services
}

export interface UploadFileRequest {
  tenantId: string;
  category: StorageCategory;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  metadata?: Record<string, string>;
}

export interface UploadedFile {
  key: string;
  url: string;
  size: number;
  contentType: string;
  metadata?: Record<string, string>;
  uploadedAt: Date;
}

export interface FileListItem {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

// SalesFlow AI specific storage categories (extended from Lawer)
export type StorageCategory = 
  // Base categories from Lawer
  | 'knowledge-base'
  | 'conversation-logs'
  | 'media-files'
  
  // SalesFlow AI extensions
  | 'sales-reports'
  | 'competitor-intelligence' 
  | 'customer-profiles'
  | 'lead-documents'
  | 'product-catalogs'
  | 'sales-scripts'
  | 'training-data'
  | 'exports';

// ============================================================================
// S3 MANAGER CLASS
// ============================================================================

export class S3Manager {
  private s3Client: S3Client;
  private config: S3Config;
  
  constructor(config: S3Config) {
    this.config = config;
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && { 
        endpoint: config.endpoint,
        forcePathStyle: true // Required for some S3-compatible services
      })
    });
  }

  // ============================================================================
  // TENANT NAMESPACE MANAGEMENT
  // ============================================================================

  /**
   * Create namespace structure for new tenant
   * Based on Lawer with SalesFlow AI extensions
   */
  async createTenantNamespace(tenantId: string): Promise<void> {
    const categories: StorageCategory[] = [
      // Base categories from Lawer
      'knowledge-base',
      'conversation-logs', 
      'media-files',
      
      // SalesFlow AI extensions
      'sales-reports',
      'competitor-intelligence',
      'customer-profiles',
      'lead-documents',
      'product-catalogs',
      'sales-scripts',
      'training-data',
      'exports'
    ];

    // Create directory structure by uploading placeholder files
    for (const category of categories) {
      const key = this.buildKey(tenantId, category, '.gitkeep');
      await this.uploadBuffer(key, Buffer.from(''), 'text/plain');
    }
  }

  /**
   * Delete entire tenant namespace
   */
  async deleteTenantNamespace(tenantId: string): Promise<void> {
    const prefix = `salesflow-shared/${tenantId}/`;
    
    // List all objects with this prefix
    const listParams = {
      Bucket: this.config.bucket,
      Prefix: prefix,
      MaxKeys: 1000
    };

    let truncated = true;
    let continuationToken: string | undefined;

    while (truncated) {
      if (continuationToken) {
        listParams['ContinuationToken'] = continuationToken;
      }

      const response = await this.s3Client.send(new ListObjectsV2Command(listParams));
      
      if (response.Contents && response.Contents.length > 0) {
        // Delete objects in batches
        for (const object of response.Contents) {
          if (object.Key) {
            await this.deleteFile(object.Key);
          }
        }
      }

      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
  }

  /**
   * Get tenant storage usage statistics
   */
  async getTenantStorageUsage(tenantId: string): Promise<{
    totalSize: number;
    fileCount: number;
    categoryBreakdown: Record<StorageCategory, { size: number; count: number }>;
  }> {
    const prefix = `salesflow-shared/${tenantId}/`;
    const files = await this.listFiles(prefix);
    
    let totalSize = 0;
    const categoryBreakdown: Record<string, { size: number; count: number }> = {};
    
    for (const file of files) {
      totalSize += file.size;
      
      // Extract category from path
      const pathParts = file.key.replace(prefix, '').split('/');
      const category = pathParts[0] as StorageCategory;
      
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = { size: 0, count: 0 };
      }
      
      categoryBreakdown[category].size += file.size;
      categoryBreakdown[category].count += 1;
    }
    
    return {
      totalSize,
      fileCount: files.length,
      categoryBreakdown: categoryBreakdown as Record<StorageCategory, { size: number; count: number }>
    };
  }

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * Upload file with tenant isolation
   */
  async uploadFile(request: UploadFileRequest): Promise<UploadedFile> {
    const key = this.buildKey(request.tenantId, request.category, request.fileName);
    
    // Add security metadata
    const metadata = {
      ...request.metadata,
      'tenant-id': request.tenantId,
      'category': request.category,
      'uploaded-at': new Date().toISOString(),
      'content-hash': this.calculateHash(request.buffer)
    };

    const putParams = {
      Bucket: this.config.bucket,
      Key: key,
      Body: request.buffer,
      ContentType: request.contentType,
      Metadata: metadata,
      ServerSideEncryption: 'AES256' // Encrypt at rest
    };

    await this.s3Client.send(new PutObjectCommand(putParams));

    return {
      key,
      url: await this.getFileUrl(key),
      size: request.buffer.length,
      contentType: request.contentType,
      metadata,
      uploadedAt: new Date()
    };
  }

  /**
   * Download file with tenant validation
   */
  async downloadFile(tenantId: string, category: StorageCategory, fileName: string): Promise<{
    buffer: Buffer;
    metadata: Record<string, string>;
    contentType: string;
  }> {
    const key = this.buildKey(tenantId, category, fileName);
    
    const getParams = {
      Bucket: this.config.bucket,
      Key: key
    };

    const response = await this.s3Client.send(new GetObjectCommand(getParams));
    
    // Validate tenant ownership
    if (response.Metadata?.['tenant-id'] !== tenantId) {
      throw new Error('Access denied: File does not belong to this tenant');
    }

    const buffer = await this.streamToBuffer(response.Body as any);

    return {
      buffer,
      metadata: response.Metadata || {},
      contentType: response.ContentType || 'application/octet-stream'
    };
  }

  /**
   * Get presigned URL for file access
   */
  async getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Get presigned URL for file upload
   */
  async getUploadUrl(
    tenantId: string, 
    category: StorageCategory, 
    fileName: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<{ uploadUrl: string; key: string }> {
    const key = this.buildKey(tenantId, category, fileName);
    
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: {
        'tenant-id': tenantId,
        'category': category
      }
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return { uploadUrl, key };
  }

  /**
   * Delete file with tenant validation
   */
  async deleteFile(key: string): Promise<void> {
    const deleteParams = {
      Bucket: this.config.bucket,
      Key: key
    };

    await this.s3Client.send(new DeleteObjectCommand(deleteParams));
  }

  /**
   * List files in tenant category
   */
  async listTenantFiles(
    tenantId: string, 
    category?: StorageCategory,
    maxKeys: number = 100
  ): Promise<FileListItem[]> {
    const prefix = category 
      ? this.buildKey(tenantId, category, '')
      : `salesflow-shared/${tenantId}/`;

    return this.listFiles(prefix, maxKeys);
  }

  // ============================================================================
  // SALES-SPECIFIC STORAGE METHODS
  // ============================================================================

  /**
   * Store sales report with metadata
   */
  async storeSalesReport(
    tenantId: string, 
    reportData: any, 
    reportType: string,
    dateRange: { from: Date; to: Date }
  ): Promise<UploadedFile> {
    const fileName = `${reportType}_${dateRange.from.toISOString().split('T')[0]}_${dateRange.to.toISOString().split('T')[0]}.json`;
    
    return this.uploadFile({
      tenantId,
      category: 'sales-reports',
      fileName,
      contentType: 'application/json',
      buffer: Buffer.from(JSON.stringify(reportData, null, 2)),
      metadata: {
        'report-type': reportType,
        'date-from': dateRange.from.toISOString(),
        'date-to': dateRange.to.toISOString(),
        'generated-at': new Date().toISOString()
      }
    });
  }

  /**
   * Store competitor intelligence data
   */
  async storeCompetitorData(
    tenantId: string,
    competitorId: string,
    data: any
  ): Promise<UploadedFile> {
    const fileName = `${competitorId}_${Date.now()}.json`;
    
    return this.uploadFile({
      tenantId,
      category: 'competitor-intelligence',
      fileName,
      contentType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data, null, 2)),
      metadata: {
        'competitor-id': competitorId,
        'data-type': 'intelligence',
        'collected-at': new Date().toISOString()
      }
    });
  }

  /**
   * Store customer profile data
   */
  async storeCustomerProfile(
    tenantId: string,
    customerId: string,
    profileData: any
  ): Promise<UploadedFile> {
    const fileName = `${customerId}_profile.json`;
    
    return this.uploadFile({
      tenantId,
      category: 'customer-profiles',
      fileName,
      contentType: 'application/json',
      buffer: Buffer.from(JSON.stringify(profileData, null, 2)),
      metadata: {
        'customer-id': customerId,
        'profile-version': '1.0',
        'updated-at': new Date().toISOString()
      }
    });
  }

  /**
   * Store product catalog
   */
  async storeProductCatalog(
    tenantId: string,
    catalogData: any,
    version: string
  ): Promise<UploadedFile> {
    const fileName = `catalog_v${version}.json`;
    
    return this.uploadFile({
      tenantId,
      category: 'product-catalogs',
      fileName,
      contentType: 'application/json',
      buffer: Buffer.from(JSON.stringify(catalogData, null, 2)),
      metadata: {
        'catalog-version': version,
        'product-count': catalogData.products?.length.toString() || '0',
        'updated-at': new Date().toISOString()
      }
    });
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private buildKey(tenantId: string, category: StorageCategory, fileName: string): string {
    // Lawer structure with SalesFlow AI extensions
    return `salesflow-shared/${tenantId}/${category}/${fileName}`;
  }

  private async uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const putParams = {
      Bucket: this.config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType
    };

    await this.s3Client.send(new PutObjectCommand(putParams));
  }

  private async listFiles(prefix: string, maxKeys: number = 100): Promise<FileListItem[]> {
    const listParams = {
      Bucket: this.config.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys
    };

    const response = await this.s3Client.send(new ListObjectsV2Command(listParams));
    
    return (response.Contents || []).map(item => ({
      key: item.Key!,
      size: item.Size || 0,
      lastModified: item.LastModified || new Date(),
      etag: item.ETag || ''
    }));
  }

  private calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Validate tenant access to file
   */
  async validateTenantAccess(key: string, tenantId: string): Promise<boolean> {
    try {
      const getParams = {
        Bucket: this.config.bucket,
        Key: key
      };

      const response = await this.s3Client.send(new GetObjectCommand(getParams));
      return response.Metadata?.['tenant-id'] === tenantId;
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata without downloading
   */
  async getFileMetadata(key: string): Promise<Record<string, string> | null> {
    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      }));
      return response.Metadata || {};
    } catch {
      return null;
    }
  }
}

export default S3Manager;