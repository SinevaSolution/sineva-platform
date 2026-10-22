'use client';

import * as React from 'react';

export interface LibrarySquadOption {
  id: string;
  name: string;
}

const LibrarySquadsContext = React.createContext<readonly LibrarySquadOption[]>([]);

/**
 * The active squads of the workspace, for the "Who can use this" picker and the
 * "Used by" faces. A context rather than a prop because the picker sits four
 * levels below the screen that loads the list.
 */
export const LibrarySquadsProvider = LibrarySquadsContext.Provider;

export function useLibrarySquads(): readonly LibrarySquadOption[] {
  return React.useContext(LibrarySquadsContext);
}
