/* eslint-disable sineva-design/no-raw-color -- brand artwork: each provider mark uses that provider's official colors on a light ground, not the theme */
import * as React from 'react';
import { siFacebook, siGmail, siGooglecalendar, siInstagram, siNotion, siShopee, siTiktok, siWhatsapp, siXendit } from 'simple-icons';
import { cn } from '@/client/components/ui/cn';

// Official brand marks. Most come from Simple Icons (simple-icons, CC0 icon
// data with each brand's official color); Midtrans publishes its own logos at
// github.com/veritrans/logo (the logogram is used, inlined below). Shown only
// to name the tool a person connects, as brand guidelines allow. A provider
// without an official mark here (Mekari Jurnal, no public brand asset found)
// falls back to its first letter in the tile.

type MarkProps = { title: string };
type SimpleIcon = { path: string; hex: string };

function brand(icon: SimpleIcon) {
  return function BrandMark({ title }: MarkProps) {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={title || undefined} aria-hidden={title ? undefined : true} className="size-[62%]" focusable="false">
        <path d={icon.path} fill={`#${icon.hex}`} />
      </svg>
    );
  };
}

function MidtransMark({ title }: MarkProps) {
  return (
    <svg viewBox="0 0 55.42 59.793" role="img" aria-label={title || undefined} aria-hidden={title ? undefined : true} className="size-[58%]" focusable="false">
      <path fill="#9ddcf9" fillRule="evenodd" d="M3.959,48.243A3.958,3.958,0,0,1,0,44.285v-28.8a3.959,3.959,0,1,1,7.917,0v28.8A3.958,3.958,0,0,1,3.959,48.243Z" />
      <path fill="#00acdb" fillRule="evenodd" d="M51.461,48.243A3.958,3.958,0,0,1,47.5,44.285V15.508a3.959,3.959,0,1,1,7.917,0V44.285A3.959,3.959,0,0,1,51.461,48.243Z" />
      <path fill="#0256a7" fillRule="evenodd" d="M27.71,59.793a3.96,3.96,0,0,1-3.959-3.959V3.959a3.959,3.959,0,1,1,7.917,0V55.834A3.959,3.959,0,0,1,27.71,59.793Z" />
    </svg>
  );
}

const MARKS: Partial<Record<string, (props: MarkProps) => React.ReactElement>> = {
  google_calendar: brand(siGooglecalendar),
  gmail: brand(siGmail),
  notion: brand(siNotion),
  xendit: brand(siXendit),
  midtrans: MidtransMark,
  whatsapp_business: brand(siWhatsapp),
  instagram: brand(siInstagram),
  facebook: brand(siFacebook),
  shopee: brand(siShopee),
  tiktok_shop: brand(siTiktok),
};

const SIZES = {
  sm: 'size-6 rounded-xs',
  md: 'size-8 rounded-sm',
  lg: 'size-10 rounded-sm',
  xl: 'size-12 rounded-sm',
} as const;

/**
 * Square tile with a provider mark on a light ground in both themes (marks are
 * drawn for light backgrounds). A provider without a drawn mark gets its first
 * letter. `decorative` is for places where the name is printed next to it.
 */
export function ProviderLogoTile({
  slug,
  name,
  size = 'lg',
  decorative = false,
  className,
}: {
  slug: string;
  name: string;
  size?: keyof typeof SIZES;
  decorative?: boolean;
  className?: string;
}) {
  const Mark = MARKS[slug];
  return (
    <span
      aria-hidden={decorative || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-border',
        Mark ? undefined : 'bg-surface-tint font-semibold text-text-brand',
        SIZES[size],
        className,
      )}
      style={Mark ? { backgroundColor: 'var(--white)' } : undefined}
    >
      {Mark ? Mark({ title: decorative ? '' : name }) : name.charAt(0).toUpperCase()}
    </span>
  );
}
