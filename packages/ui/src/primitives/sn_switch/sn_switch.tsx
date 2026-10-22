'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../../lib/field_context';
import { focusRing } from '../../lib/focus';

export type SNSwitchProps = Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'children'>;

/**
 * On/off switch (`role="switch"`). The 44 px hit area is the `before`
 * pseudo-element, so the track can stay 24 px tall and still meet the
 * touch-target rule. The label lives outside (a `label htmlFor`, a settings
 * row) or comes from `aria-label`.
 */
export const SNSwitch = React.forwardRef<HTMLButtonElement, SNSwitchProps>(function SNSwitch(
  { className, ...props },
  ref,
) {
  const a11y = useFieldControl(props as { id?: string; 'aria-describedby'?: string });
  return (
    <SwitchPrimitive.Root
      ref={ref}
      {...props}
      id={a11y.id}
      aria-describedby={a11y['aria-describedby']}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-border-strong transition-colors duration-150 before:absolute before:-inset-2 before:content-[""] data-[state=checked]:bg-action-primary disabled:cursor-not-allowed disabled:opacity-45',
        focusRing,
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-text-inverse shadow-sm transition-transform duration-150 ease-out data-[state=checked]:translate-x-[22px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
});
