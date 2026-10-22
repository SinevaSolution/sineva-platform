import type { TryLibraryDto } from '@/server/application/dtos/library_dto';
import { mintCall, requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { computeRetrievalScope, principalsForScopes } from '@/server/domain/library/library_access';

const SNIPPET_MAX_CHARS = 400;

export interface LibraryTryResult {
  results: Array<{
    document_id: string;
    title: string;
    chunk_id: string;
    page: number | null;
    section_path: string | null;
    snippet: string;
    source_uri: string | null;
    trust_label: string;
  }>;
  abstained: boolean;
  abstain_reason: string | null;
  /** The scope the platform used, so an Admin can see what was searched. */
  principals: string[];
}

/**
 * Runs retrieval against a chosen specialist's scope so an Admin can test
 * before relying on it (FR-LIB-05). The scope comes from `computeRetrievalScope`
 * (session, never the body), and the answer is checked again here: a hit is
 * kept only if the document exists in this workspace, is `ready`, and carries
 * a scope that matches a principal of this request. sineva-ai enforces the
 * same filter in Qdrant; this second check means a stale `acl` there (a failed
 * relabel, a delete in progress) cannot show a document the platform already
 * knows is out of scope. Generating an answer from the passages is the chat
 * path's job; this returns the passages themselves.
 */
export class TryLibraryRetrievalUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(dto: TryLibraryDto, context: RequestContext): Promise<LibraryTryResult> {
    const { documents, gateway, log } = this.deps;
    const workspaceId = requireWorkspace(context);
    const scope = computeRetrievalScope(context, { agent_slug: dto.agent_slug });
    const slug = dto.agent_slug?.toLowerCase().trim();

    const answer = await gateway.search(
      { tenant_id: scope.tenant_id, principals: scope.principals, query_text: dto.query, top_k: dto.top_k },
      await mintCall(this.deps, context, { agent_slug: slug && slug !== 'sino' ? slug : null }),
    );

    const known = new Map<string, Awaited<ReturnType<typeof documents.findById>>>();
    for (const id of new Set(answer.results.map((hit) => hit.document_id))) {
      known.set(id, await documents.findById(workspaceId, id));
    }

    const results: LibraryTryResult['results'] = [];
    for (const hit of answer.results) {
      const document = known.get(hit.document_id);
      const inScope =
        document !== null &&
        document !== undefined &&
        document.uploaded_at !== null &&
        document.status === 'ready' &&
        principalsForScopes(document.scopes).some((principal) => scope.principals.includes(principal));
      if (!inScope || !document) {
        continue;
      }
      results.push({
        document_id: document.id,
        title: document.title,
        chunk_id: hit.chunk_id,
        page: hit.page,
        section_path: hit.section_path,
        snippet: hit.snippet.slice(0, SNIPPET_MAX_CHARS),
        source_uri: hit.source_uri,
        trust_label: hit.trust_label,
      });
    }

    const rejected = answer.results.length - results.length;
    if (rejected > 0) {
      log.warn('library.retrieval_rejected', { workspace_id: workspaceId, count: rejected });
    }
    if (results.length === 0 && answer.results.length > 0) {
      return { results, abstained: true, abstain_reason: 'no_authorized_results', principals: scope.principals };
    }
    return {
      results,
      abstained: answer.abstained,
      abstain_reason: answer.abstain_reason,
      principals: scope.principals,
    };
  }
}
