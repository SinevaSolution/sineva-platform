export interface SpecialistCatalogEntry {
  slug: string;
  handle: string;
  displayName: string;
}

export const CANONICAL_SPECIALISTS: ReadonlyArray<SpecialistCatalogEntry> = [
  { slug: 'sino', handle: '@Sino', displayName: 'Sino' },
  { slug: 'sinopeople', handle: '@SinoPeople', displayName: 'SinoPeople' },
  { slug: 'sinofinance', handle: '@SinoFinance', displayName: 'SinoFinance' },
  { slug: 'sinosales', handle: '@SinoSales', displayName: 'SinoSales' },
  { slug: 'sinosocial', handle: '@SinoSocial', displayName: 'SinoSocial' },
  { slug: 'sinohelp', handle: '@SinoHelp', displayName: 'SinoHelp' },
  { slug: 'sinoinsights', handle: '@SinoInsights', displayName: 'SinoInsights' },
] as const;

export const CANONICAL_SPECIALIST_SLUGS = new Set(
  CANONICAL_SPECIALISTS.map((s) => s.slug),
);

export function findSpecialistBySlug(slug: string): SpecialistCatalogEntry | undefined {
  const normalized = slug.toLowerCase().trim();
  return CANONICAL_SPECIALISTS.find((s) => s.slug === normalized);
}

export function findSpecialistByHandle(handle: string): SpecialistCatalogEntry | undefined {
  const clean = handle.startsWith('@') ? handle.slice(1).toLowerCase().trim() : handle.toLowerCase().trim();
  return CANONICAL_SPECIALISTS.find(
    (s) => s.slug === clean || s.displayName.toLowerCase() === clean,
  );
}
