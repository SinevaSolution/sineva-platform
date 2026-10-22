import type {
  ConnectionActivityView,
  ConnectionDisconnectView,
  ConnectionTestView,
  ConnectionView,
  GrantRowView,
  ProviderView,
} from '@/shared/connection_view';
import type {
  GetConnectionUseCase,
  ListConnectionActivityUseCase,
  ListConnectionsUseCase,
  ListProvidersUseCase,
} from '../application/connections/connection_queries';
import type { TestConnectionUseCase } from '../application/connections/connection_actions';
import type { DisconnectConnectionUseCase } from '../application/connections/disconnect_connection_use_case';
import type { SaveApiKeyConnectionUseCase } from '../application/connections/save_api_key_connection_use_case';
import type { UpdateConnectionGrantsUseCase } from '../application/connections/update_connection_grants_use_case';

// Compile-time drift guard (R-14): what the connection use cases return stays
// assignable to the views the Connected tools UI reads. The views have no field
// for a token, a key or ciphertext, so a use case cannot return one through them.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type ProvidersServedAsView = AssertAssignable<Awaited<ReturnType<ListProvidersUseCase['execute']>>, { providers: ProviderView[] }>;
export type ConnectionListServedAsView = AssertAssignable<
  Awaited<ReturnType<ListConnectionsUseCase['execute']>>,
  { connections: ConnectionView[] }
>;
export type ConnectionServedAsView = AssertAssignable<
  Awaited<ReturnType<GetConnectionUseCase['execute']>>,
  { connection: ConnectionView }
>;
export type SavedKeyServedAsView = AssertAssignable<
  Awaited<ReturnType<SaveApiKeyConnectionUseCase['execute']>>,
  { connection: ConnectionView; created: boolean }
>;
export type GrantsServedAsView = AssertAssignable<
  Awaited<ReturnType<UpdateConnectionGrantsUseCase['execute']>>,
  { grants: GrantRowView[] }
>;
export type DisconnectServedAsView = AssertAssignable<
  Awaited<ReturnType<DisconnectConnectionUseCase['execute']>>,
  ConnectionDisconnectView
>;
export type TestServedAsView = AssertAssignable<Awaited<ReturnType<TestConnectionUseCase['execute']>>, ConnectionTestView>;
export type ActivityServedAsView = AssertAssignable<
  Awaited<ReturnType<ListConnectionActivityUseCase['execute']>>,
  ConnectionActivityView
>;
