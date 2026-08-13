import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly supabase?: SupabaseClient;
  private readonly bucket?: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('supabase.url');
    const key = this.configService.get<string>('supabase.serviceRoleKey');
    this.bucket = this.configService.get<string>('supabase.bucketName');

    if (url && key && url.startsWith('http')) {
      try {
        this.supabase = createClient(url, key);
      } catch (e: any) {
        this.logger.warn(`Could not initialize Supabase client: ${e.message}`);
      }
    }
  }

  async uploadFile(
    filePath: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    // 1. Try Supabase if configured and client exists
    if (this.supabase && this.bucket) {
      try {
        const { error } = await this.supabase.storage
          .from(this.bucket)
          .upload(filePath, buffer, { contentType: mimetype, upsert: true });

        if (!error) {
          return this.getPublicUrl(filePath);
        }
        this.logger.warn(`Supabase storage upload error: ${error.message}. Using local disk storage fallback.`);
      } catch (err: any) {
        this.logger.warn(`Supabase exception: ${err.message}. Using local disk storage fallback.`);
      }
    }

    // 2. Local disk upload fallback
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', path.dirname(filePath));
      fs.mkdirSync(uploadDir, { recursive: true });
      const fullPath = path.join(process.cwd(), 'uploads', filePath);
      fs.writeFileSync(fullPath, buffer);
      
      const port = this.configService.get<number>('port') ?? 3000;
      const baseUrl = process.env.API_BASE_URL || `http://localhost:${port}`;
      const cleanPath = filePath.replace(/\\/g, '/');
      return `${baseUrl}/uploads/${cleanPath}`;
    } catch (diskErr: any) {
      this.logger.warn(`Disk upload failed: ${diskErr.message}. Falling back to Data URL.`);
      const base64 = buffer.toString('base64');
      return `data:${mimetype};base64,${base64}`;
    }
  }

  getPublicUrl(filePath: string): string {
    if (this.supabase && this.bucket) {
      const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(filePath);
      return data.publicUrl;
    }
    const port = this.configService.get<number>('port') ?? 3000;
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${port}`;
    const cleanPath = filePath.replace(/\\/g, '/');
    return `${baseUrl}/uploads/${cleanPath}`;
  }

  async deleteFile(filePath: string): Promise<void> {
    if (this.supabase && this.bucket) {
      try {
        const { error } = await this.supabase.storage
          .from(this.bucket)
          .remove([filePath]);
        if (error) {
          this.logger.warn(`Supabase delete error: ${error.message}`);
        }
      } catch (e: any) {
        this.logger.warn(`Supabase delete exception: ${e.message}`);
      }
    }

    // Also delete local disk file if exists
    try {
      const fullPath = path.join(process.cwd(), 'uploads', filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (err: any) {
      this.logger.warn(`Local file deletion error: ${err.message}`);
    }
  }

  buildPath(folder: string, entityId: string, originalName: string): string {
    const timestamp = Date.now();
    const safe = (originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${folder}/${entityId}/${timestamp}-${safe}`;
  }

  extractPathFromUrl(url: string): string {
    if (!url) return '';
    if (url.includes('/uploads/')) {
      const parts = url.split('/uploads/');
      return parts[1] ?? '';
    }
    if (this.bucket && url.includes(`/${this.bucket}/`)) {
      const parts = url.split(`/${this.bucket}/`);
      return parts[1] ?? '';
    }
    return '';
  }
}
