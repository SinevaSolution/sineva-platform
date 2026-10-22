import type { SquadSessionDetailView, SquadTemplateView, SquadTurnView, SquadView } from '@/shared/squad_view';
import type { SquadEntity } from '../domain/squads/squad';
import type { SquadTurnEntity } from '../domain/squads/squad_ports';
import type { toSquadSessionDetailView, toSquadTemplateView, toSquadTurnView, toSquadView } from './squad_view';

// Compile-time drift guard: what the mappers return must stay the shared view.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type SquadServedAsView = AssertAssignable<ReturnType<typeof toSquadView>, SquadView>;
export type SquadTurnServedAsView = AssertAssignable<ReturnType<typeof toSquadTurnView>, SquadTurnView>;
export type SquadSessionServedAsView = AssertAssignable<ReturnType<typeof toSquadSessionDetailView>, SquadSessionDetailView>;
export type SquadTemplateServedAsView = AssertAssignable<ReturnType<typeof toSquadTemplateView>, SquadTemplateView>;

// The entities the views are built from keep the fields the views name.
export type SquadStatusStillMatches = AssertAssignable<SquadEntity['status'], SquadView['status']>;
export type TurnStatusStillMatches = AssertAssignable<SquadTurnEntity['status'], SquadTurnView['status']>;
