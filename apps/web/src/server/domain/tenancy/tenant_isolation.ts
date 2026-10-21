import { ValidationError } from '@/server/domain/errors/domain_error';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'app',
  'w',
  'login',
  'signup',
  'sign-in',
  'sign-up',
  'settings',
  'auth',
  'account',
  'help',
  'docs',
  'internal',
  'status',
  'assets',
  'static',
  'public',
  'billing',
  'pricing',
  'legal',
  'terms',
  'privacy',
  'support',
  'system',
  'root',
  'workspace',
  'workspaces',
]);

/**
 * Validates that a workspace_id is a valid UUIDv4/v7.
 * Prevents directory traversal and key collision attacks (SEC-3).
 */
export function validateWorkspaceId(workspaceId: string): void {
  if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
    throw new ValidationError(
      'Invalid workspace identifier. Must be a valid UUID.',
      [
        {
          code: 'invalid_workspace_id',
          field: 'workspace_id',
          detail: 'workspace_id must be a valid UUID format',
        },
      ],
    );
  }
}

/**
 * Builds an isolated object storage prefix: t/{workspace_id}/ (SEC-3)
 */
export function buildStoragePrefix(workspaceId: string): string {
  validateWorkspaceId(workspaceId);
  return `t/${workspaceId}/`;
}

/**
 * Builds an isolated object storage key: t/{workspace_id}/{normalized_path} (SEC-3)
 */
export function buildStorageKey(workspaceId: string, path: string): string {
  validateWorkspaceId(workspaceId);
  const cleanPath = path.replace(/^\/+/, '').trim();
  return `t/${workspaceId}/${cleanPath}`;
}

/**
 * Builds an isolated tenant cache key: t:{workspace_id}:{suffix} (SEC-3)
 */
export function buildTenantCacheKey(workspaceId: string, suffix: string): string {
  validateWorkspaceId(workspaceId);
  const cleanSuffix = suffix.replace(/^:+/, '').trim();
  return `t:${workspaceId}:${cleanSuffix}`;
}

/**
 * Checks if a candidate slug is a reserved system path (FR-SHELL-13)
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase().trim());
}

/**
 * Generates a clean URL slug from a company/business name (FR-AUTH-11, FR-SHELL-13)
 */
export function generateWorkspaceSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // remove non-word chars except hyphens and spaces
    .trim()
    .replace(/[\s_-]+/g, '-') // collapse whitespace and underscores to single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens

  if (!slug) {
    slug = 'workspace';
  }

  if (slug.length > 48) {
    slug = slug.substring(0, 48).replace(/-+$/, '');
  }

  if (isReservedSlug(slug)) {
    slug = `${slug}-workspace`;
  }

  return slug;
}
