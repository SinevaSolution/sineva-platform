/* eslint-disable sineva-design/no-raw-color, sineva/no-hardcoded-strings -- brand artwork: a provider's mark uses that provider's own colors (drawn for a light ground, not following the theme) and letterforms that are not copy */
import * as React from 'react';
import { cn } from '@/client/components/ui/cn';

// Simple marks drawn from basic shapes and text, not the providers' official
// artwork: no third-party logo files live in the repo. The colors approximate
// each brand (recalling, not verified against brand guidelines), the names are
// spelled as the providers spell them. Swap a mark for the licensed asset by
// replacing its entry here; nothing else knows how a mark is drawn.

type MarkProps = { title: string };

function Svg({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={title} className="size-[62%]" focusable="false">
      {children}
    </svg>
  );
}

const MARKS: Partial<Record<string, (props: MarkProps) => React.ReactElement>> = {
  google_calendar: ({ title }) => (
    <Svg title={title}>
      <rect x="3" y="4" width="18" height="17" rx="3" fill="#FFFFFF" stroke="#4285F4" strokeWidth="1.8" />
      <rect x="3" y="4" width="18" height="5" rx="2" fill="#4285F4" />
      <text x="12" y="18" textAnchor="middle" fontSize="9" fontWeight="700" fill="#4285F4" fontFamily="sans-serif">
        31
      </text>
    </Svg>
  ),
  notion: ({ title }) => (
    <Svg title={title}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#FFFFFF" stroke="#111111" strokeWidth="1.8" />
      <text x="12" y="17" textAnchor="middle" fontSize="12" fontWeight="700" fill="#111111" fontFamily="serif">
        N
      </text>
    </Svg>
  ),
  xendit: ({ title }) => (
    <Svg title={title}>
      <path d="M5 5l14 14M19 5L5 19" stroke="#1B6CF2" strokeWidth="3.4" strokeLinecap="round" />
    </Svg>
  ),
  midtrans: ({ title }) => (
    <Svg title={title}>
      <path
        d="M4.5 19V6l7.5 8 7.5-8v13"
        fill="none"
        stroke="#0A2E5C"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),
  mekari_jurnal: ({ title }) => (
    <Svg title={title}>
      <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#E8590C" />
      <text x="12" y="17.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FFFFFF" fontFamily="sans-serif">
        J
      </text>
    </Svg>
  ),
  whatsapp_business: ({ title }) => (
    <Svg title={title}>
      <path
        d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z"
        fill="#25D366"
      />
      <path
        d="M9 8.2c.3 2.6 2.6 5.1 5.9 6.4l1.3-1.3-1.9-1-.9.8c-.9-.4-1.9-1.3-2.4-2.3l.8-.9-1-1.9z"
        fill="#FFFFFF"
      />
    </Svg>
  ),
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
