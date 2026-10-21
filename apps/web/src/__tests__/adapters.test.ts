import { describe, expect, it } from 'vitest';
import { SeaweedStorageRepository } from '@/server/infrastructure/storage/seaweed_storage_repository';

// Adapter-level behaviour that the use-case tests no longer cover now that
// they run against fakes. The AI gateway is covered in contract/.
describe('Infrastructure adapters', () => {
  it('storage adapter sanitizes the object_key of presigned uploads', async () => {
    const storage = new SeaweedStorageRepository();

    const result = await storage.createPresignedUploadUrl({
      workspace_id: 'wks_enterprise_01',
      file_name: 'Q4 Financial Model.xlsx',
      content_type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_size_bytes: 512000,
    });

    expect(result.storage_provider).toBe('seaweedfs_s3');
    expect(result.object_key).toContain('workspaces/wks_enterprise_01/');
    expect(result.object_key).toContain('q4_financial_model.xlsx');
    expect(result.upload_url).toContain('http');
  });
});
