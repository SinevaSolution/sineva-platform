// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNTooltip, SNTooltipProvider } from './sn_tooltip';

beforeAll(installDomPolyfills);
afterEach(cleanup);

function setup(props: { shortcut?: string } = {}) {
  return render(
    <SNTooltipProvider delayDuration={0}>
      <SNTooltip label="Rename chat" {...props}>
        <button type="button">Trigger</button>
      </SNTooltip>
    </SNTooltipProvider>,
  );
}

describe('SNTooltip', () => {
  it('shows the label on keyboard focus and links it to the trigger', async () => {
    setup();
    await act(async () => {
      screen.getByRole('button', { name: 'Trigger' }).focus();
    });
    const tips = await screen.findAllByText('Rename chat');
    expect(tips.length).toBeGreaterThan(0);
    expect(screen.getByRole('tooltip').textContent).toContain('Rename chat');
    expect(screen.getByRole('button', { name: 'Trigger' }).getAttribute('aria-describedby')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await act(async () => {
      trigger.focus();
    });
    await screen.findByRole('tooltip');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders a shortcut hint after the label', async () => {
    setup({ shortcut: '[' });
    await act(async () => {
      screen.getByRole('button', { name: 'Trigger' }).focus();
    });
    const tip = await screen.findByRole('tooltip');
    expect(tip.querySelector('kbd')?.textContent).toBe('[');
  });

  it('does not render the content until it is asked for', () => {
    setup();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
