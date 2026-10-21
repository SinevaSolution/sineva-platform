import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCHEMA_PATH = resolve(import.meta.dirname, '../../prisma/schema.prisma');

interface ModelDefinition {
  name: string;
  tableName: string;
  schema?: string;
  fields: Map<string, { type: string; attributes: string[] }>;
  modelDirectives: string[];
}

function parsePrismaSchema(content: string): ModelDefinition[] {
  const models: ModelDefinition[] = [];
  const lines = content.split('\n');

  let currentModel: ModelDefinition | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Ignore comments and empty lines
    if (!line || line.startsWith('//')) {
      continue;
    }

    if (line.startsWith('model ')) {
      const match = line.match(/^model\s+(\w+)\s*\{/);
      if (match) {
        currentModel = {
          name: match[1],
          tableName: match[1].toLowerCase(),
          fields: new Map(),
          modelDirectives: [],
        };
      }
      continue;
    }

    if (line === '}' && currentModel) {
      models.push(currentModel);
      currentModel = null;
      continue;
    }

    if (currentModel) {
      if (line.startsWith('@@')) {
        currentModel.modelDirectives.push(line);
        const mapMatch = line.match(/@@map\("([^"]+)"\)/);
        if (mapMatch) {
          currentModel.tableName = mapMatch[1];
        }
        const schemaMatch = line.match(/@@schema\("([^"]+)"\)/);
        if (schemaMatch) {
          currentModel.schema = schemaMatch[1];
        }
      } else {
        const parts = line.split(/\s+/);
        const fieldName = parts[0];
        const fieldType = parts[1];
        const attributes = parts.slice(2);
        currentModel.fields.set(fieldName, { type: fieldType, attributes });
      }
    }
  }

  return models;
}

describe('Prisma Schema Conventions (WP-M0-21)', () => {
  const schemaContent = readFileSync(SCHEMA_PATH, 'utf-8');
  const models = parsePrismaSchema(schemaContent);

  it('declares every model in schema "platform" (R-16, ADR-0006)', () => {
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(
        model.schema,
        `Model ${model.name} must specify @@schema("platform")`,
      ).toBe('platform');
    }
  });

  it('uses UUID primary keys for every model (ADR-0014, R-21)', () => {
    for (const model of models) {
      const idField = model.fields.get('id');
      expect(idField, `Model ${model.name} must have an "id" field`).toBeDefined();
      expect(idField?.type).toBe('String');
      const hasIdAttr = idField?.attributes.includes('@id');
      const hasUuidAttr = idField?.attributes.includes('@db.Uuid');
      expect(hasIdAttr, `Model ${model.name}.id must have @id attribute`).toBe(true);
      expect(hasUuidAttr, `Model ${model.name}.id must have @db.Uuid attribute`).toBe(true);
    }
  });

  it('contains all required identity, tenancy, and auth models', () => {
    const modelNames = models.map((m) => m.name);
    const requiredModels = [
      'Workspace',
      'WorkspaceMember',
      'WorkspaceMemberSpecialist',
      'WorkspaceInvitation',
      'User',
      'Account',
      'Session',
      'Verification',
      'PlatformStaff',
      'AuthLoginAttempt',
    ];

    for (const req of requiredModels) {
      expect(modelNames, `Missing required model ${req} in schema.prisma`).toContain(req);
    }
  });

  it('enforces tenant-scoping with workspace_id on tenant-owned models (FR-AUTH-29)', () => {
    // Tenant-owned models (exclude Workspace itself which is the tenant root, and global tables)
    const tenantModels = [
      'WorkspaceMember',
      'WorkspaceMemberSpecialist',
      'WorkspaceInvitation',
      'Conversation',
      'StorageObject',
    ];

    for (const modelName of tenantModels) {
      const model = models.find((m) => m.name === modelName);
      expect(model, `Tenant model ${modelName} not found`).toBeDefined();
      if (!model) continue;

      const wsIdField = model.fields.get('workspace_id') || model.fields.get('workspaceId');
      expect(
        wsIdField,
        `Tenant model ${modelName} must have workspace_id field`,
      ).toBeDefined();
      expect(
        wsIdField?.type,
        `Tenant model ${modelName}.workspace_id must be non-nullable String (UUID)`,
      ).toBe('String');
      expect(
        wsIdField?.attributes.includes('@db.Uuid'),
        `Tenant model ${modelName}.workspace_id must have @db.Uuid`,
      ).toBe(true);
    }
  });

  it('keeps global tables free from tenant-ownership workspace_id', () => {
    // Global tables must not be bound to a single workspace
    const globalModels = [
      'User',
      'Account',
      'Verification',
      'PlatformStaff',
      'AuthLoginAttempt',
      'SigningKey',
    ];

    for (const modelName of globalModels) {
      const model = models.find((m) => m.name === modelName);
      expect(model, `Global model ${modelName} not found`).toBeDefined();
      if (!model) continue;

      const wsIdField = model.fields.get('workspace_id');
      expect(
        wsIdField,
        `Global model ${modelName} must NOT have workspace_id`,
      ).toBeUndefined();
    }
  });

  it('configures User entity with Section A2 profile attributes and removes legacy role & workspace_id', () => {
    const userModel = models.find((m) => m.name === 'User');
    expect(userModel).toBeDefined();
    if (!userModel) return;

    // Must NOT have legacy fields
    expect(userModel.fields.get('workspace_id')).toBeUndefined();
    expect(userModel.fields.get('role')).toBeUndefined();
    expect(userModel.fields.get('is_active')).toBeUndefined();

    // Must have Section A2 fields
    expect(userModel.fields.get('full_name')).toBeDefined();
    expect(userModel.fields.get('preferred_name')).toBeDefined();
    expect(userModel.fields.get('salutation')).toBeDefined();
    expect(userModel.fields.get('phone_number')).toBeDefined();
    expect(userModel.fields.get('phone_verified_at')).toBeDefined();
    expect(userModel.fields.get('locale')).toBeDefined();
    expect(userModel.fields.get('timezone')).toBeDefined();
    expect(userModel.fields.get('about_me')).toBeDefined();
    expect(userModel.fields.get('use_profile_in_context')).toBeDefined();
    expect(userModel.fields.get('status')).toBeDefined();
    expect(userModel.fields.get('two_factor_enabled')).toBeDefined();
    expect(userModel.fields.get('email_verified')).toBeDefined();
    expect(userModel.fields.get('email_verified_at')).toBeDefined();
  });

  it('configures Workspace entity with lifecycle states and owner reference', () => {
    const wsModel = models.find((m) => m.name === 'Workspace');
    expect(wsModel).toBeDefined();
    if (!wsModel) return;

    expect(wsModel.fields.get('owner_user_id')).toBeDefined();
    expect(wsModel.fields.get('status')).toBeDefined();
    expect(wsModel.fields.get('status_reason')).toBeDefined();
    expect(wsModel.fields.get('trial_ends_at')).toBeDefined();
    expect(wsModel.fields.get('timezone')).toBeDefined();
    expect(wsModel.fields.get('default_locale')).toBeDefined();
    expect(wsModel.fields.get('logo_url')).toBeDefined();
    expect(wsModel.fields.get('deleted_at')).toBeDefined();

    // Untouched billing fields
    expect(wsModel.fields.get('subscription_tier')).toBeDefined();
    expect(wsModel.fields.get('monthly_token_quota')).toBeDefined();
    expect(wsModel.fields.get('monthly_tokens_consumed')).toBeDefined();
  });

  it('configures WorkspaceMember with role, specialist_scope, and composite uniqueness', () => {
    const memberModel = models.find((m) => m.name === 'WorkspaceMember');
    expect(memberModel).toBeDefined();
    if (!memberModel) return;

    expect(memberModel.fields.get('workspace_id')).toBeDefined();
    expect(memberModel.fields.get('user_id')).toBeDefined();
    expect(memberModel.fields.get('role')).toBeDefined();
    expect(memberModel.fields.get('specialist_scope')).toBeDefined();
    expect(memberModel.fields.get('job_title')).toBeDefined();
    expect(memberModel.fields.get('department')).toBeDefined();

    const uniqueDirectives = memberModel.modelDirectives.filter((d) =>
      d.includes('@@unique'),
    );
    expect(
      uniqueDirectives.some((d) => d.includes('workspace_id') && d.includes('user_id')),
      'WorkspaceMember must have @@unique([workspace_id, user_id])',
    ).toBe(true);
  });
});
