'use client';

import { Button } from '@/client/components/ui/button';
import { SinoFigure } from '@/client/components/ui/sino_figure';

export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <SinoFigure pose="confused" size={120} />
      <h1 className="text-base font-semibold">Something went wrong on our side</h1>
      <p className="max-w-sm text-sm text-fg-secondary">Nothing you did caused this. Try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
