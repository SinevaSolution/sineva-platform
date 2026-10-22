// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LibraryAccessPicker } from '@/client/components/library/library_access_picker';
import { LibrarySquadsProvider } from '@/client/components/library/library_squads';
import { LibraryUsedBy } from '@/client/components/library/library_parts';
import type { AccessChoice } from '@/client/components/library/library_model';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
import { SNTooltipProvider } from '@sineva/ui';
import type { ShellSpecialistView } from '@/shared/shell_view';

afterEach(cleanup);

const SPECIALISTS = [
  { agent_slug: 'sinofinance', display_name: 'SinoFinance', role_title: 'x', short_description: 'x', accent_key: 'finance', room_theme_id: 'sinofinance', starter_prompts: ['a', 'b', 'c'] },
] as unknown as ShellSpecialistView[];
const SQUADS = [{ id: 'sq-1', name: 'Back-office' }, { id: 'sq-2', name: 'Launch squad' }];

function setup(ui: React.ReactNode, squads = SQUADS) {
  return render(
    <SNTooltipProvider>
      <I18nProvider locale="en" messages={CATALOGS.en}>
        <LibrarySquadsProvider value={squads}>{ui}</LibrarySquadsProvider>
      </I18nProvider>
    </SNTooltipProvider>,
  );
}

const choice = (over: Partial<AccessChoice> = {}): AccessChoice => ({ everyone: false, specialists: [], squads: [], ...over });

describe('Library "Who can use this" with squads (ADR-0043)', () => {
  it('lists each squad as a toggle next to the specialists and reports the choice', () => {
    const onChange = vi.fn();
    setup(<LibraryAccessPicker value={choice({ specialists: ['sinofinance'] })} onChange={onChange} specialists={SPECIALISTS} />);
    const back = screen.getByRole('button', { name: 'Back-office' });
    expect(back.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(back);
    expect(onChange).toHaveBeenCalledWith({ everyone: false, specialists: ['sinofinance'], squads: ['sq-1'] });
  });

  it('shows a chosen squad as on, and turning it off removes it', () => {
    const onChange = vi.fn();
    setup(<LibraryAccessPicker value={choice({ squads: ['sq-2'] })} onChange={onChange} specialists={SPECIALISTS} />);
    const launch = screen.getByRole('button', { name: 'Launch squad' });
    expect(launch.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(launch);
    expect(onChange).toHaveBeenCalledWith({ everyone: false, specialists: [], squads: [] });
  });

  it('shows squads as included but locked while Everyone is on, and clears them when Everyone is turned on', () => {
    const onChange = vi.fn();
    const { rerender } = setup(
      <LibraryAccessPicker value={choice({ squads: ['sq-1'] })} onChange={onChange} specialists={SPECIALISTS} />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith({ everyone: true, specialists: [], squads: [] });
    rerender(
      <SNTooltipProvider>
        <I18nProvider locale="en" messages={CATALOGS.en}>
          <LibrarySquadsProvider value={SQUADS}>
            <LibraryAccessPicker value={choice({ everyone: true })} onChange={onChange} specialists={SPECIALISTS} />
          </LibrarySquadsProvider>
        </I18nProvider>
      </SNTooltipProvider>,
    );
    const back = screen.getByRole('button', { name: 'Back-office' });
    expect(back.getAttribute('aria-pressed')).toBe('true');
    expect((back as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps Workflows as a disabled Soon option and shows no squad chips when there are no squads', () => {
    setup(<LibraryAccessPicker value={choice()} onChange={() => undefined} specialists={SPECIALISTS} />, []);
    const workflows = screen.getByRole('button', { name: /Workflows/ });
    expect((workflows as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Back-office' })).toBeNull();
  });

  it('names the squad in "Used by"', () => {
    setup(<LibraryUsedBy scopes={[{ scope_type: 'squad', scope_ref: 'sq-1' }]} specialists={SPECIALISTS} />);
    expect(screen.getAllByText('Back-office').length).toBeGreaterThan(0);
  });
});
