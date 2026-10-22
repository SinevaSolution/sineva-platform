// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNTooltipProvider } from '../sn_tooltip/sn_tooltip';
import { SNIconButton } from './sn_icon_button';

beforeAll(installDomPolyfills);
afterEach(cleanup);

const icon = <svg aria-hidden="true" data-testid="icon" />;

function setup(node: React.ReactElement) {
  return render(<SNTooltipProvider delayDuration={0}>{node}</SNTooltipProvider>);
}

describe('SNIconButton', () => {
  it('takes its accessible name from the required label', () => {
    setup(<SNIconButton label="Close menu">{icon}</SNIconButton>);
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeTruthy();
  });

  it('shows the label as a tooltip on focus', async () => {
    setup(<SNIconButton label="Close menu">{icon}</SNIconButton>);
    await act(async () => {
      screen.getByRole('button', { name: 'Close menu' }).focus();
    });
    expect((await screen.findByRole('tooltip')).textContent).toContain('Close menu');
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    setup(
      <SNIconButton label="Close menu" onClick={onClick}>
        {icon}
      </SNIconButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('can show a tooltip that differs from its accessible name', async () => {
    setup(
      <SNIconButton label="Options for Quarterly plan" tooltip="Options">
        {icon}
      </SNIconButton>,
    );
    const button = screen.getByRole('button', { name: 'Options for Quarterly plan' });
    await act(async () => {
      button.focus();
    });
    expect((await screen.findByRole('tooltip')).textContent).toBe('Options');
  });

  it('xs is a 24 px square with the small radius and keeps the 44 px hit area', () => {
    setup(
      <SNIconButton label="x" size="xs">
        {icon}
      </SNIconButton>,
    );
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('size-6');
    expect(cls).toContain('rounded-xs');
    expect(cls).toContain('after:h-11');
  });

  it.each([
    ['sm', 'size-7'],
    ['md', 'size-9'],
    ['lg', 'size-11'],
  ] as const)('size %s is a fixed square', (size, cls) => {
    setup(
      <SNIconButton label="x" size={size}>
        {icon}
      </SNIconButton>,
    );
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it('keeps a 44 px hit area on the small sizes', () => {
    setup(
      <SNIconButton label="x" size="sm">
        {icon}
      </SNIconButton>,
    );
    expect(screen.getByRole('button').className).toContain('after:h-11');
  });

  it('exposes a pressed state when given one', () => {
    setup(
      <SNIconButton label="Pin" pressed>
        {icon}
      </SNIconButton>,
    );
    expect(screen.getByRole('button', { name: 'Pin' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('is a plain button when not toggled', () => {
    setup(<SNIconButton label="Pin">{icon}</SNIconButton>);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBeNull();
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('forwards a ref and extra props to the button', () => {
    const ref = { current: null as HTMLButtonElement | null };
    setup(
      <SNIconButton label="x" ref={ref} data-state-test="1">
        {icon}
      </SNIconButton>,
    );
    expect(ref.current?.getAttribute('data-state-test')).toBe('1');
  });
});
