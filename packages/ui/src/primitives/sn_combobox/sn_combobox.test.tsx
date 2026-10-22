// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNField } from '../sn_field/sn_field';
import { SNCombobox, snComboboxFilter, type SNComboboxOption } from './sn_combobox';

beforeAll(installDomPolyfills);
afterEach(cleanup);

const zones: SNComboboxOption[] = [
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta' },
  { value: 'Asia/Makassar', label: 'Asia/Makassar' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'Europe/London', label: 'Europe/London' },
];

const labels = {
  placeholder: 'Pick a time zone',
  searchPlaceholder: 'Search time zones',
  searchLabel: 'Search time zones',
  emptyLabel: 'No time zone found',
};

function Harness({ initial = 'Asia/Jakarta', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <SNCombobox
      aria-label="Time zone"
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      options={zones}
      {...labels}
    />
  );
}

async function open() {
  const trigger = screen.getByRole('combobox', { name: 'Time zone' });
  await act(async () => {
    fireEvent.click(trigger);
  });
  return screen.findByRole('listbox');
}

describe('snComboboxFilter', () => {
  it('matches a substring ignoring case', () => {
    expect(snComboboxFilter('Asia/Jakarta', 'jakarta', ['Asia/Jakarta'])).toBeGreaterThan(0);
  });

  it('treats underscores and slashes as spaces so "new york" finds America/New_York', () => {
    expect(snComboboxFilter('America/New_York', 'new york', ['America/New_York'])).toBeGreaterThan(0);
  });

  it('requires every word to match', () => {
    expect(snComboboxFilter('Asia/Jakarta', 'asia london', ['Asia/Jakarta'])).toBe(0);
  });

  it('returns everything for an empty search', () => {
    expect(snComboboxFilter('x', '', [])).toBeGreaterThan(0);
  });

  it('ranks a label that starts with the search above one that only contains it', () => {
    const starts = snComboboxFilter('Asia/Jakarta', 'asia', ['Asia/Jakarta']);
    const contains = snComboboxFilter('America/Asia', 'asia', ['America/Asia']);
    expect(starts).toBeGreaterThan(contains);
  });
});

describe('SNCombobox', () => {
  it('is a combobox button showing the selected label', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Time zone' });
    expect(trigger.textContent).toContain('Asia/Jakarta');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the placeholder without a matching value', () => {
    render(<Harness initial="" />);
    expect(screen.getByRole('combobox').textContent).toContain('Pick a time zone');
  });

  it('opens a listbox with a labelled search box and every option', async () => {
    render(<Harness />);
    const listbox = await open();
    expect(within(listbox).getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('combobox', { name: 'Search time zones' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Time zone' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('filters while typing', async () => {
    render(<Harness />);
    await open();
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Search time zones' }), { target: { value: 'new york' } });
    });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain('America/New_York');
  });

  it('says so when nothing matches', async () => {
    render(<Harness />);
    await open();
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Search time zones' }), { target: { value: 'zzzz' } });
    });
    expect(screen.getByText('No time zone found')).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('selects an option with a click, closes and shows the new label', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Europe\/London/ }));
    });
    expect(onChange).toHaveBeenCalledWith('Europe/London');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Time zone' }).textContent).toContain('Europe/London');
  });

  it('selects the highlighted option with the keyboard', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await open();
    const search = screen.getByRole('combobox', { name: 'Search time zones' });
    await act(async () => {
      fireEvent.change(search, { target: { value: 'makassar' } });
    });
    await act(async () => {
      fireEvent.keyDown(search, { key: 'Enter' });
    });
    expect(onChange).toHaveBeenCalledWith('Asia/Makassar');
  });

  it('closes on Escape and gives focus back to the trigger', async () => {
    render(<Harness />);
    await open();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search time zones' }), { key: 'Escape' });
    });
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Time zone' })));
  });

  it('clears the search when it closes', async () => {
    render(<Harness />);
    await open();
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Search time zones' }), { target: { value: 'london' } });
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search time zones' }), { key: 'Escape' });
    });
    await open();
    expect((screen.getByRole('combobox', { name: 'Search time zones' }) as HTMLInputElement).value).toBe('');
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('can be disabled', () => {
    render(<SNCombobox aria-label="Time zone" disabled value="" onValueChange={() => {}} options={zones} {...labels} />);
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
  });

  it('takes its label and description from an SNField', () => {
    render(
      <SNField label="Time zone" hint="Used for dates" error="Pick one">
        <SNCombobox value="" onValueChange={() => {}} options={zones} {...labels} />
      </SNField>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Time zone' });
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-describedby')).toBe(screen.getByText('Pick one').id);
  });

  it('keeps the form value in a hidden input when it has a name', () => {
    const { container } = render(
      <form>
        <SNCombobox aria-label="Time zone" name="timezone" value="Asia/Jakarta" onValueChange={() => {}} options={zones} {...labels} />
      </form>,
    );
    expect((container.querySelector('input[name="timezone"]') as HTMLInputElement | null)?.value).toBe('Asia/Jakarta');
  });

  it('is 44 px tall', () => {
    render(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Time zone' }).className).toContain('h-11');
  });
});
