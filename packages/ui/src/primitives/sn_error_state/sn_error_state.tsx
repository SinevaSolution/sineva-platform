import { cx } from '../../lib/cx';
import { SNButton } from '../sn_button/sn_button';
import { SNSinoStill } from '../sn_sino_still/sn_sino_still';

const HEADINGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const;

export type SNErrorStateProps = {
  title: string;
  /**
   * Already-resolved copy, shown verbatim. Resolve it from the machine error
   * code (`errorCodeToMessageKey`), never from the API `message`, which is
   * English, developer-facing and may name internals.
   */
  message: string;
  headingLevel?: keyof typeof HEADINGS;
  className?: string;
} & (
  | { onRetry: () => void; retryLabel: string }
  // No retry for errors that need a change first (403, 404, 422).
  | { onRetry?: undefined; retryLabel?: undefined }
) &
  (
    | { requestId: string; requestIdLabel: string }
    | { requestId?: undefined; requestIdLabel?: undefined }
  );

export function SNErrorState({
  title,
  message,
  headingLevel = 2,
  onRetry,
  retryLabel,
  requestId,
  requestIdLabel,
  className,
}: SNErrorStateProps) {
  const Heading = HEADINGS[headingLevel];
  return (
    <div role="alert" className={cx('flex flex-col items-center gap-3 text-center', className)}>
      <SNSinoStill pose="confused" size={128} />
      <Heading className="text-lg font-semibold text-text">{title}</Heading>
      <p className="max-w-prose text-sm text-text-secondary">{message}</p>
      {onRetry ? (
        <SNButton variant="secondary" onClick={onRetry}>
          {retryLabel}
        </SNButton>
      ) : null}
      {requestId ? (
        <p className="flex flex-wrap items-baseline justify-center gap-1.5 text-xs text-text-tertiary">
          <span>{requestIdLabel}</span>
          <span className="select-all font-mono">{requestId}</span>
        </p>
      ) : null}
    </div>
  );
}
