import type { AgentView } from '@/shared/agent_view';
import type { AgentEntity } from '../domain/entities/agent';

// Compile-time drift guard. Route handlers serialise `AgentEntity` straight
// into the response and the client types that payload as `AgentView`. Because
// the two are separate declarations, a field rename or a narrowed union on the
// entity would otherwise break the client only at runtime. The constraint below
// makes the type-check fail instead. A type-level check is used (rather than a
// runtime test) since the mismatch is purely structural and costs nothing at
// runtime.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type AgentEntityServedAsView = AssertAssignable<AgentEntity, AgentView>;
