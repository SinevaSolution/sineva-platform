'use client';

import { PresetEmptyState } from '@/client/components/ui/empty_state';

export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <PresetEmptyState preset="workspace_error" onAction={reset} headingLevel={1} />
    </div>
  );
}
