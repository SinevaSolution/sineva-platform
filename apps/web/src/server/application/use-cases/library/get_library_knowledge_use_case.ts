import { requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { CANONICAL_SPECIALISTS } from '@/server/domain/chat/specialist_catalog';

export interface LibraryKnowledge {
  /** Documents Sino can use in team chats: Ready and marked Everyone. */
  everyone: number;
  /** Per specialist the caller may use: Everyone's documents plus those chosen for it. */
  specialists: Record<string, number>;
}

/**
 * "Knows N documents" (ADR-0033). It counts what a companion can really use,
 * the same rule the retrieval scope applies: Everyone plus the specialist's own,
 * Ready only. A document marked both Everyone and a specialist counts once.
 */
export class GetLibraryKnowledgeUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'documents'>) {}

  async execute(context: RequestContext): Promise<LibraryKnowledge> {
    const counts = await this.deps.documents.knowledgeCounts(requireWorkspace(context));
    const specialists: Record<string, number> = {};
    for (const { slug } of CANONICAL_SPECIALISTS) {
      // Sino has no scope of its own, and a member sees only the specialists they may use.
      if (slug === 'sino') continue;
      if (context.specialist_scope === 'selected' && !(context.allowed_specialists ?? []).includes(slug)) continue;
      specialists[slug] = counts.everyone + (counts.specialist_only[slug] ?? 0);
    }
    return { everyone: counts.everyone, specialists };
  }
}
