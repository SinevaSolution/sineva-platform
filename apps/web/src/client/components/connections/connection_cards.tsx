'use client';

import Link from 'next/link';
import * as React from 'react';
import { SNBadge, SNButton, SNCard } from '@sineva/ui';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { ConnectionView, ProviderCategory, ProviderView } from '@/shared/connections_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import {
  canConnect,
  connectKind,
  connectionStatusPresentation,
  providerShortName,
  type ConnectionsRole,
  type ProviderStateKind,
} from './connections_model';
import { ProviderLogoTile } from './provider_mark';

// Literal keys on purpose (see connections_model.ts).
export const PROVIDER_PURPOSE_KEYS: Record<string, string> = {
  google_calendar: 'providers.google_calendar',
  gmail: 'providers.gmail',
  notion: 'providers.notion',
  xendit: 'providers.xendit',
  midtrans: 'providers.midtrans',
  mekari_jurnal: 'providers.mekari_jurnal',
  whatsapp_business: 'providers.whatsapp_business',
};

export const CATEGORY_KEYS = {
  calendar: 'category.calendar',
  docs: 'category.docs',
  payments: 'category.payments',
  accounting: 'category.accounting',
  messaging: 'category.messaging',
  marketplace: 'category.marketplace',
} as const satisfies Record<ProviderCategory, string>;

const MAX_TILES = 3;

function SpecialistTiles({
  slugs,
  specialists,
}: {
  slugs: string[];
  specialists: ShellSpecialistView[];
}) {
  const named = slugs
    .map((slug) => specialists.find((s) => s.agent_slug === slug))
    .filter((s): s is ShellSpecialistView => Boolean(s));
  if (named.length === 0) return null;
  return (
    <ul className="flex items-center gap-1" aria-label={named.map((s) => s.display_name).join(', ')}>
      {named.slice(0, MAX_TILES).map((s) => (
        <li key={s.agent_slug}>
          <SNSpecialistTile agentSlug={s.agent_slug} name={s.display_name} size="sm" />
        </li>
      ))}
      {named.length > MAX_TILES ? (
        <li className="ps-1 text-[11px] text-text-tertiary">+{named.length - MAX_TILES}</li>
      ) : null}
    </ul>
  );
}

/** One connection (not one provider): two accounts of a tool are two cards. */
export function ConnectedCard({
  connection,
  provider,
  workspaceSlug,
  specialists,
  onReconnect,
}: {
  connection: ConnectionView;
  provider: ProviderView | null;
  workspaceSlug: string;
  specialists: ShellSpecialistView[];
  onReconnect: (connection: ConnectionView) => void;
}) {
  const t = useTranslations('connections');
  const status = connectionStatusPresentation(connection.status);
  // The server says whether this person may reconnect it (Owner, Admin, or the owner of a personal one).
  const canFix = connection.can.reconnect;
  const category = provider ? t(CATEGORY_KEYS[provider.category]) : null;
  const short = connection.provider_short_name ?? connection.provider_name;
  const withAccess = connection.grants.filter((g) => g.access_level !== 'none').map((g) => g.agent_slug);
  return (
    <SNCard className="flex min-h-40 flex-col gap-3">
      <div className="flex items-start gap-3">
        <ProviderLogoTile slug={connection.provider_slug} name={connection.provider_name} decorative />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-text">
            <Link
              href={`/w/${workspaceSlug}/tools/${connection.id}`}
              aria-label={t('card.open_label', {
                app: connection.provider_name,
                status: t(status.labelKey),
              })}
              className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {connection.provider_name}
            </Link>
          </h3>
          <p className="truncate text-[13px] text-text-tertiary">
            {[category, connection.owner_scope === 'user' ? t('card.only_you') : t('card.shared')]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <SNBadge tone={status.tone}>{t(status.labelKey)}</SNBadge>
      </div>
      {connection.account_label ? (
        <p className="break-all text-[13px] text-text-secondary">{connection.account_label}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <SpecialistTiles slugs={withAccess} specialists={specialists} />
        {connection.status === 'needs_reconnect' ? (
          canFix ? (
            <SNButton variant="secondary" size="sm" onClick={() => onReconnect(connection)}>
              {t('card.reconnect', { app: short })}
            </SNButton>
          ) : (
            <span className="text-[13px] text-text-secondary">{t('card.ask_admin_reconnect')}</span>
          )
        ) : connection.status === 'partial' ? (
          <SNButton asChild variant="secondary" size="sm">
            <Link href={`/w/${workspaceSlug}/tools/${connection.id}`}>{t('card.fix_access')}</Link>
          </SNButton>
        ) : (
          <SNButton asChild variant="ghost" size="sm">
            <Link href={`/w/${workspaceSlug}/tools/${connection.id}`}>{t('card.manage')}</Link>
          </SNButton>
        )}
      </div>
    </SNCard>
  );
}

/** A provider with no live connection: Connect, or the honest reason it cannot be. */
export function ProviderCard({
  provider,
  kind,
  role,
  specialists,
  onConnect,
}: {
  provider: ProviderView;
  kind: ProviderStateKind;
  role: ConnectionsRole;
  specialists: ShellSpecialistView[];
  onConnect: (provider: ProviderView) => void;
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const short = providerShortName(provider);
  const purposeKey = PROVIDER_PURPOSE_KEYS[provider.slug] ?? 'providers.generic';
  const described = locale === 'id' ? provider.description_id : provider.description_en;
  const permission = canConnect(role, provider);
  let status: React.ReactNode = null;
  if (kind === 'not_available') status = <SNBadge tone="neutral">{t('status.not_available')}</SNBadge>;
  else if (kind === 'paused') status = <SNBadge tone="neutral">{t('status.paused')}</SNBadge>;
  else if (provider.availability === 'beta') status = <SNBadge tone="brand">{t('status.beta')}</SNBadge>;

  let action: React.ReactNode = null;
  // A sign-in this client cannot run yet (WhatsApp's own setup) offers no button.
  if (kind === 'connect' && connectKind(provider) !== 'unsupported') {
    if (permission === 'yes') {
      action = (
        <SNButton variant="secondary" size="sm" onClick={() => onConnect(provider)}>
          {t('card.connect', { app: short })}
        </SNButton>
      );
    } else if (permission === 'ask_admin') {
      action = <span className="text-[13px] text-text-secondary">{t('card.ask_admin_connect')}</span>;
    }
  }
  return (
    <SNCard className="flex min-h-40 flex-col gap-3">
      <div className="flex items-start gap-3">
        <ProviderLogoTile slug={provider.slug} name={provider.name} decorative />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-text">{provider.name}</h3>
          <p className="truncate text-[13px] text-text-tertiary">{t(CATEGORY_KEYS[provider.category])}</p>
        </div>
        {status}
      </div>
      <p className="line-clamp-2 text-[13px] text-text-secondary">{described ?? t(purposeKey)}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <SpecialistTiles slugs={provider.specialists} specialists={specialists} />
        {action}
      </div>
    </SNCard>
  );
}

/** Static, never a link or a button (a coming soon tool cannot be opened). */
export function ComingSoonCard({ provider }: { provider: ProviderView }) {
  const t = useTranslations('connections');
  return (
    <li className="flex items-center gap-3 rounded-lg bg-canvas-alt p-3">
      <ProviderLogoTile slug={provider.slug} name={provider.name} size="md" decorative className="opacity-70" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{provider.name}</p>
        <p className="truncate text-[12px] text-text-tertiary">{t(CATEGORY_KEYS[provider.category])}</p>
      </div>
    </li>
  );
}
