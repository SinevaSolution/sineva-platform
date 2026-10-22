'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { controlHeight, controlSurface } from '../../lib/control';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../../lib/field_context';
import { SNIconButton } from '../sn_icon_button/sn_icon_button';

export interface SNInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Icon or text inside the start edge. Decorative: it is not announced. */
  startAdornment?: React.ReactNode;
  /** Node inside the end edge (a unit, a clear button). Interactive content is allowed. */
  endAdornment?: React.ReactNode;
  /**
   * Password variant: with `type="password"` and both labels, a toggle at the
   * end reveals the value. The labels name the action the toggle will do, and
   * come from the caller so they are translated. Without them there is no toggle.
   */
  showLabel?: string;
  hideLabel?: string;
}

export const SNInput = React.forwardRef<HTMLInputElement, SNInputProps>(function SNInput(
  { startAdornment, endAdornment, showLabel, hideLabel, type = 'text', className, ...props },
  ref,
) {
  const a11y = useFieldControl(props);
  const [revealed, setRevealed] = React.useState(false);
  const canReveal = type === 'password' && Boolean(showLabel) && Boolean(hideLabel);

  const end = canReveal ? (
    <SNIconButton
      label={revealed ? (hideLabel as string) : (showLabel as string)}
      size="sm"
      tooltipSide="top"
      onClick={() => setRevealed((v) => !v)}
    >
      {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </SNIconButton>
  ) : (
    endAdornment
  );

  const input = (
    <input
      ref={ref}
      type={canReveal && revealed ? 'text' : type}
      {...props}
      {...a11y}
      className={cx(
        controlSurface,
        controlHeight,
        startAdornment ? 'ps-10' : undefined,
        end ? 'pe-11' : undefined,
        className,
      )}
    />
  );

  if (!startAdornment && !end) return input;

  return (
    <div className="relative flex items-center">
      {startAdornment ? (
        <span aria-hidden="true" className="pointer-events-none absolute start-3 flex items-center text-text-tertiary [&_svg]:size-4">
          {startAdornment}
        </span>
      ) : null}
      {input}
      {end ? <span className="absolute end-2 flex items-center">{end}</span> : null}
    </div>
  );
});
