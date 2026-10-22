import { PresetEmptyState } from '@/client/components/ui/empty_state';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas-alt p-6">
      <PresetEmptyState preset="not_found" actionHref="/" headingLevel={1} />
    </main>
  );
}
