import { WrongTokenAudienceError } from '@/server/domain/inbox/inbox_errors';

// Decision, changes and answer endpoints accept a Sineva session only
// (FR-INBOX-11): an external AI tool over MCP can read the Inbox but never
// approve. MCP tokens arrive with WP-M2-38; until then this stub refuses the
// shapes they will have, so the rule and its per-route test exist from the
// start. Sineva session tokens carry no `aud` claim, so a bearer token that
// names an audience, or uses the `mcp_` prefix, was minted for someone else.
// The token is never verified here (withAuth does that); this only looks at
// what the token says it is for.

const MCP_PREFIX = /^(sineva_)?mcp_/i;

function audienceOf(token: string): unknown {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    return claims.aud;
  } catch {
    return undefined;
  }
}

export function assertSessionOnly(request: Request): void {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return;
  const token = header.slice(7).trim();
  if (MCP_PREFIX.test(token) || audienceOf(token) !== undefined) {
    throw new WrongTokenAudienceError();
  }
}
