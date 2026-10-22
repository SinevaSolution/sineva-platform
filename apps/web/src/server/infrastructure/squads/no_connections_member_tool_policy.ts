import 'server-only';
import type { MemberToolPolicy } from '@/server/domain/squads/squad_ports';

/**
 * Member tools are the intersection of the specialist's allowlist, the
 * person's permissions and the connections they can use (ADR-0043). There is no
 * connections module on this base, so there is nothing to intersect with and
 * the answer is no tools: a squad can read and draft, and never gains a tool
 * by being a squad. The connections work replaces this adapter in
 * `container.ts` and nothing else changes.
 */
export class NoConnectionsMemberToolPolicy implements MemberToolPolicy {
  async allowedTools(): Promise<string[]> {
    return [];
  }
}
