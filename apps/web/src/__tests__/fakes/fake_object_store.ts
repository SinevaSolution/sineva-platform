import type { ObjectStore, PresignedPut } from '@/server/domain/repositories/object_store';

export class FakeObjectStore implements ObjectStore {
  readonly objects = new Map<string, { bytes: Uint8Array; content_type: string }>();
  readonly presigns: Array<{ key: string; content_type: string; size_bytes: number }> = [];
  readonly deleted: string[] = [];
  /** Keys whose delete fails, to exercise cleanup reporting. */
  readonly failDelete = new Set<string>();

  /** Simulates the browser PUT to the presigned URL. */
  upload(key: string, bytes: Uint8Array, content_type = 'application/octet-stream'): void {
    this.objects.set(key, { bytes, content_type });
  }

  async createPresignedPut(input: {
    key: string;
    content_type: string;
    size_bytes: number;
    expires_in_seconds: number;
  }): Promise<PresignedPut> {
    this.presigns.push({ key: input.key, content_type: input.content_type, size_bytes: input.size_bytes });
    return {
      upload_url: `https://fake-storage.test/bucket/${input.key}`,
      expires_in_seconds: input.expires_in_seconds,
    };
  }

  async getObject(key: string, max_bytes: number): Promise<Uint8Array | null> {
    const found = this.objects.get(key);
    return found ? found.bytes.slice(0, max_bytes + 1) : null;
  }

  async putObject(key: string, bytes: Uint8Array, content_type: string): Promise<void> {
    this.objects.set(key, { bytes, content_type });
  }

  async deleteObject(key: string): Promise<void> {
    if (this.failDelete.has(key)) {
      throw new Error('delete failed');
    }
    this.deleted.push(key);
    this.objects.delete(key);
  }
}
