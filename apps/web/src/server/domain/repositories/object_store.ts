export interface PresignedPut {
  upload_url: string;
  expires_in_seconds: number;
}

/**
 * Raw object access by key, for pipelines that handle bytes on the server
 * (avatars). `StorageRepository` stays the workspace-file presign port; this
 * one has no tenant notion because callers build keys from validated ids.
 */
export interface ObjectStore {
  /** The signed request pins the content type and length the browser may send. */
  createPresignedPut(input: {
    key: string;
    content_type: string;
    size_bytes: number;
    expires_in_seconds: number;
  }): Promise<PresignedPut>;
  /**
   * Reads an object, or null when it does not exist. Reads at most
   * `max_bytes + 1` bytes, so a caller detects "too large" without buffering
   * an arbitrarily big object.
   */
  getObject(key: string, max_bytes: number): Promise<Uint8Array | null>;
  putObject(key: string, bytes: Uint8Array, content_type: string): Promise<void>;
  /** Idempotent: deleting a missing key succeeds. */
  deleteObject(key: string): Promise<void>;
}
