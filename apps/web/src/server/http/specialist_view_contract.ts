import type { WorkspaceSpecialistRosterView } from '@/shared/specialist_view';
import type { WorkspaceSpecialistRoster } from '../domain/specialists/workspace_specialist';

// Compile-time drift guard. The roster route serialises
// `WorkspaceSpecialistRoster` straight into the response and the client types
// that payload as `WorkspaceSpecialistRosterView`. They are separate
// declarations, so a renamed field or a narrowed union on the domain type would
// otherwise break the client only at runtime; this makes the type-check fail.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type RosterServedAsView = AssertAssignable<
  WorkspaceSpecialistRoster,
  WorkspaceSpecialistRosterView
>;
