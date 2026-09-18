import { Injectable } from '@nestjs/common';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
export interface PhotoStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE');
@Injectable()
export class LocalPhotoStorage implements PhotoStorage {
  private root = path.resolve(process.env.UPLOAD_DIR || 'uploads');
  private file(key: string) {
    if (!/^[a-f0-9-]+(?:-thumb)?\.webp$/.test(key)) throw new Error('Invalid storage key');
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.file(key), data, { flag: 'wx' });
  }
  async get(key: string) {
    return readFile(this.file(key));
  }
  async remove(key: string) {
    await unlink(this.file(key)).catch(() => {});
  }
}
