// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNField } from '../sn_field/sn_field';
import { SNSelect, type SNSelectOption } from './sn_select';

beforeAll(installDomPolyfills);
afterEach(cleanup);

const options: SNSelectOption[] = [
  { value: '', label: 'Not set' },
  { value: 'mr', label: 'Mr.' },
  { value: 'ms', label: 'Ms.' },
  { value: 'dr', label: 'Dr.', disabled: true },
];

function setup(props: Partial<React.ComponentProps<typeof SNSelect>> = {}) {
  const onValueChange = vi.fn();
  const utils = render(
    <SNSelect aria-label="Salutation" value="mr" onValueChange={onValueChange} options={options} placeholder="Choose" {...props} />,
  );
  return { onValueChange, ...utils };
}

async function open() {
  const trigger = screen.getByRole('combobox', { name: 'Salutation' });
  await act(async () => {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
  });
  return screen.findByRole('listbox');
}

describe('SNSelect', () => {
  it('is a combobox button named by its label, showing the selected label', () => {
    setup();
    const trigger = screen.getByRole('combobox', { name: 'Salutation' });
    expect(trigger.textContent).toContain('Mr.');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the placeholder when nothing matches the value', () => {
    setup({ value: 'unknown', options: options.filter((o) => o.value !== '') });
    expect(screen.getByRole('combobox').textContent).toContain('Choose');
  });

  it('shows the label of an empty-string option (a "not set" choice)', () => {
    setup({ value: '' });
    expect(screen.getByRole('combobox').textContent).toContain('Not set');
  });

  it('opens with the keyboard and lists every option', async () => {
    setup();
    const listbox = await open();
    expect(within(listbox).getAllByRole('option')).toHaveLength(4);
    // Radix hides the rest of the page from assistive technology while open.
    expect(screen.getByRole('combobox', { hidden: true }).getAttribute('aria-expanded')).toBe('true');
  });

  it('marks the current value as selected', async () => {
    setup();
    const listbox = await open();
    expect(within(listbox).getByRole('option', { name: 'Mr.' }).getAttribute('aria-selected')).toBe('true');
  });

  it('reports the chosen value', async () => {
    const { onValueChange } = setup();
    const listbox = await open();
    await act(async () => {
      fireEvent.click(within(listbox).getByRole('option', { name: 'Ms.' }));
    });
    expect(onValueChange).toHaveBeenCalledWith('ms');
  });

  it('maps the empty-string option back to an empty value', async () => {
    const { onValueChange } = setup();
    const listbox = await open();
    await act(async () => {
      fireEvent.click(within(listbox).getByRole('option', { name: 'Not set' }));
    });
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('disables an option', async () => {
    const { onValueChange } = setup();
    const listbox = await open();
    const dr = within(listbox).getByRole('option', { name: 'Dr.' });
    expect(dr.getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      fireEvent.click(dr);
    });
    expect(onValueChange).not.toHaveBeenCalledWith('dr');
  });

  it('closes on Escape and gives focus back to the trigger', async () => {
    setup();
    const listbox = await open();
    await act(async () => {
      fireEvent.keyDown(listbox, { key: 'Escape' });
    });
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox')));
  });

  it('can be disabled', () => {
    setup({ disabled: true });
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
  });

  it('takes its label and description from an SNField', () => {
    render(
      <SNField label="Salutation" hint="How Sino greets you" error="Pick one">
        <SNSelect value="" onValueChange={() => {}} options={options} placeholder="Choose" />
      </SNField>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Salutation' });
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-describedby')).toBe(screen.getByText('Pick one').id);
  });

  it('is 44 px tall and does not set aria-invalid by default', () => {
    setup();
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toContain('h-11');
    expect(trigger.getAttribute('aria-invalid')).toBeNull();
  });

  it('keeps the form value in a hidden native select when it has a name', () => {
    const { container } = render(
      <form>
        <SNSelect aria-label="Salutation" name="salutation" value="ms" onValueChange={() => {}} options={options} />
      </form>,
    );
    const native = container.querySelector('select[name="salutation"]') as HTMLSelectElement | null;
    expect(native?.value).toBe('ms');
  });
});
