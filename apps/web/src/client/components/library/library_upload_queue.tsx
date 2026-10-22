'use client';

import { X } from 'lucide-react';
import { SNIconButton, SNProgressBar, SNStatusChip } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';

export type LibraryUploadState =
  { status: 'uploading' | 'queued' } | { status: 'failed'; error: string };

export function LibraryUploadQueue({
  files,
  states,
  pending,
  onRemove,
}: {
  files: readonly File[];
  states: ReadonlyMap<File, LibraryUploadState>;
  pending: boolean;
  onRemove: (file: File) => void;
}) {
  const t = useTranslations('library_ui');
  return (
    <ul aria-label={t('upload_queue')} className="space-y-3">
      {files.map((file, index) => {
        const state = states.get(file);
        return (
          <li
            key={`${file.name}-${index}`}
            className="space-y-2 rounded-md border border-border p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 break-all text-sm font-medium">{file.name}</span>
              {state?.status !== 'queued' ? (
                <SNIconButton
                  label={t('remove_file', { name: file.name })}
                  disabled={pending}
                  onClick={() => onRemove(file)}
                >
                  <X aria-hidden="true" />
                </SNIconButton>
              ) : null}
            </div>
            <div role="status" aria-live="polite">
              <SNStatusChip
                tone={
                  state?.status === 'queued'
                    ? 'success'
                    : state?.status === 'failed'
                      ? 'danger'
                      : state?.status === 'uploading'
                        ? 'info'
                        : 'neutral'
                }
                label={
                  state?.status === 'queued'
                    ? t('upload_received')
                    : state?.status === 'failed'
                      ? t('upload_failed')
                      : state?.status === 'uploading'
                        ? t('upload_in_progress')
                        : t('upload_waiting')
                }
              />
            </div>
            {state?.status === 'uploading' ? (
              <SNProgressBar label={t('uploading_file', { name: file.name })} />
            ) : null}
            {state?.status === 'failed' ? (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
