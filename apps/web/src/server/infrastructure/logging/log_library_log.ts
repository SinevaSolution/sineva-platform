import 'server-only';
import type { LibraryLog, LibraryLogEvent, LibraryLogFields } from '@/server/domain/library/library_ports';
import { logger } from './logger';

// Adapter for the Library log port. The port carries ids, codes and counts
// only, and the logger enforces its own allowlist on top, so a document title
// or text cannot reach a log line through here.
export class LoggerLibraryLog implements LibraryLog {
  warn(event: LibraryLogEvent, fields: LibraryLogFields): void {
    logger.warn(event, {
      ...(fields.workspace_id ? { workspace_id: fields.workspace_id } : {}),
      ...(fields.document_id ? { document_id: fields.document_id } : {}),
      ...(fields.reason ? { reason: fields.reason } : {}),
      ...(fields.status !== undefined ? { status: fields.status } : {}),
      ...(fields.count !== undefined ? { quantity: fields.count } : {}),
    });
  }
}
