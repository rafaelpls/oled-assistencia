import { Injectable } from '@nestjs/common';
import { PhotoStorage } from './storage.service';

@Injectable()
export class SupabasePhotoStorage implements PhotoStorage {
  private url: string;
  private token: string;
  private bucket: string;

  constructor() {
    this.url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.token = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'os-photos';

    if (
      process.env.PHOTO_STORAGE === 'supabase' &&
      (!this.url || !this.token)
    ) {
      throw new Error(
        'PHOTO_STORAGE=supabase requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY configuradas no ambiente.',
      );
    }
  }

  private endpoint(key: string) {
    if (!/^[a-f0-9-]+(?:-thumb)?\.webp$/.test(key)) {
      throw new Error('Invalid storage key');
    }

    return `${this.url}/storage/v1/object/${this.bucket}/${key}`;
  }

  private async request(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    body?: Buffer,
  ) {
    const res = await fetch(this.endpoint(key), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        apikey: this.token,
        ...(body ? { 'Content-Type': 'image/webp' } : {}),
      },
      body: body ? new Uint8Array(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
      throw new Error(
        `Supabase Storage retornou status HTTP ${res.status}.`,
      );
    }

    return res;
  }

  async put(key: string, data: Buffer) {
    await this.request('PUT', key, data);
  }

  async get(key: string) {
    const res = await this.request('GET', key);
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(key: string) {
    await this.request('DELETE', key);
  }
}
