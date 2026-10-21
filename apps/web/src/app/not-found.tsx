import Link from 'next/link';
import { SinoFigure } from '@/client/components/ui/sino_figure';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
      <SinoFigure pose="confused" size={120} />
      <h1 className="text-base font-semibold">Sino can&apos;t find this page</h1>
      <p className="max-w-sm text-sm text-fg-secondary">
        It may have moved, or you may not have access to it.
      </p>
      <Link href="/" className="text-sm font-medium text-fg-brand underline-offset-4 hover:underline">
        Go to Home
      </Link>
    </main>
  );
}
