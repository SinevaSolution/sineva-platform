import Link from 'next/link';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { getTranslations } from '@/i18n/server';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
      <SinoFigure pose="confused" size={120} />
      <h1 className="text-base font-semibold">{t('not_found.title')}</h1>
      <p className="max-w-sm text-sm text-fg-secondary">{t('not_found.body')}</p>
      <Link href="/" className="text-sm font-medium text-fg-brand underline-offset-4 hover:underline">
        {t('not_found.cta')}
      </Link>
    </main>
  );
}
