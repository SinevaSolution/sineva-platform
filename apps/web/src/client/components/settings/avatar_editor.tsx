'use client';

import { Camera, Loader2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { cn } from '@/client/components/ui/cn';
import { Tooltip } from '@/client/components/ui/tooltip';
import { apiRequest } from '@/client/lib/api';
import { AVATAR_CONTENT_TYPES } from '@/shared/avatar_limits';
import { uploadAvatar } from '@/client/lib/avatar_upload';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { ProfileView } from '@/shared/profile_view';
import { initialsOf } from './profile_form_model';

/**
 * The big avatar of the profile header. The whole circle is the "Change
 * photo" button: on hover and keyboard focus a camera overlay shows, and a
 * small camera chip stays visible so touch users, who have no hover, can see
 * the control. Initials on a soft teal tint are the fallback.
 */
export function AvatarEditor({
  avatarUrl,
  name,
  email,
  onChanged,
}: {
  avatarUrl: string | null;
  name: string;
  email: string;
  onChanged: (profile: ProfileView) => void;
}) {
  const t = useTranslations('account');
  const errorText = useApiErrorText();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  // The URL whose request failed (the file vanished from storage); that exact
  // URL falls back to initials, and a new upload has a new URL, so it retries.
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires `change`.
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      onChanged(await uploadAvatar(file));
      toast.success(t('avatar.updated'));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      onChanged(await apiRequest<ProfileView>('/api/v1/me/avatar', { method: 'DELETE' }));
      toast.success(t('avatar.removed'));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  const showImage = avatarUrl !== null && avatarUrl !== brokenUrl;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <Tooltip label={t('avatar.change')} side="bottom">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={t('avatar.change')}
          aria-busy={busy}
          className="group relative size-20 rounded-full outline-offset-4 disabled:cursor-progress"
        >
          <span
            className={cn(
              'flex size-full items-center justify-center overflow-hidden rounded-full text-2xl font-semibold',
              showImage
                ? 'bg-canvas-alt'
                : 'bg-[color-mix(in_oklab,var(--color-focus)_22%,var(--color-surface))] text-text-brand',
            )}
          >
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route: the image optimizer cannot send the session cookie and the server already re-encoded the file
              <img
                src={avatarUrl}
                alt=""
                width={80}
                height={80}
                className="size-full object-cover"
                onError={() => setBrokenUrl(avatarUrl)}
              />
            ) : (
              <span aria-hidden="true">{initialsOf(name, email)}</span>
            )}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-full bg-scrim text-text-inverse transition-opacity duration-150',
              busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          </span>
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -end-0.5 flex size-7 items-center justify-center rounded-full border-2 border-surface bg-action-primary text-text-inverse"
          >
            <Camera className="size-3.5" />
          </span>
        </button>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_CONTENT_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        onChange={onFile}
      />
      {avatarUrl ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-[12px] text-text-tertiary underline-offset-2 hover:text-text hover:underline disabled:opacity-45"
        >
          {t('avatar.remove')}
        </button>
      ) : null}
    </div>
  );
}
