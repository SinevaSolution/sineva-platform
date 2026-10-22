import { notFound } from 'next/navigation';
import { ComponentGallery } from '@/client/components/dev_ui/gallery';

export const metadata = { robots: { index: false, follow: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_UI !== '1') notFound();
  const query = await searchParams;
  const width = Number(query.width);
  return (
    <ComponentGallery
      theme={query.theme === 'dark' ? 'dark' : 'light'}
      locale={query.locale === 'id' ? 'id' : 'en'}
      pseudo={query.pseudo === '1'}
      width={[360, 390, 834, 1024, 1440].includes(width) ? width : 1440}
      component={typeof query.component === 'string' ? query.component : undefined}
    />
  );
}
