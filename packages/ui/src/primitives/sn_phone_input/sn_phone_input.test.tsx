// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import * as galleries from '../../gallery';
import * as ui from '../../index';
import { SNField } from '../sn_field/sn_field';
import { SNPhoneInput, type SNPhoneInputProps } from './sn_phone_input';
import { SNPhoneInputGallery } from './sn_phone_input.gallery';

beforeAll(installDomPolyfills);
afterEach(cleanup);

const labels = {
  locale: 'en',
  countryLabel: 'Country code',
  searchPlaceholder: 'Search country or code',
  searchLabel: 'Search countries',
  emptyTitle: 'No country found',
  emptyDescription: 'Try a name, a code like ID or a dial code like +62.',
};

type HarnessProps = Partial<Omit<SNPhoneInputProps, 'value' | 'onValueChange'>> & {
  initial?: string;
  onChange?: (value: string) => void;
};

function Harness({ initial = '', onChange, ...props }: HarnessProps) {
  const [value, setValue] = React.useState(initial);
  return (
    <SNPhoneInput
      aria-label="Phone number"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      {...labels}
      {...props}
    />
  );
}

const numberInput = () => screen.getByRole('textbox', { name: 'Phone number' }) as HTMLInputElement;
const countryButton = () => screen.getByRole('combobox', { name: /^Country code/ });

function type(value: string) {
  fireEvent.change(numberInput(), { target: { value } });
}

async function openList() {
  await act(async () => {
    fireEvent.click(countryButton());
  });
  const listbox = await screen.findByRole('listbox');
  // The list publishes its active option a tick after it opens.
  await waitFor(() => expect(search().getAttribute('aria-activedescendant')).toBeTruthy());
  return listbox;
}

const search = () => screen.getByRole('combobox', { name: 'Search countries' }) as HTMLInputElement;

async function searchFor(text: string) {
  await act(async () => {
    fireEvent.change(search(), { target: { value: text } });
  });
}

// Option text without the flag emoji, which is decoration for screen readers.
const plain = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '');
const optionNames = () => screen.queryAllByRole('option').map(plain);

describe('SNPhoneInput default country', () => {
  it('starts on Indonesia: flag and dial code on the country button', () => {
    render(<Harness />);
    const button = countryButton();
    expect(button.textContent).toContain('\u{1F1EE}\u{1F1E9}');
    expect(button.textContent).toContain('+62');
    expect(button.getAttribute('aria-label')).toBe('Country code: Indonesia +62');
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('hides the flag emoji from screen readers', () => {
    render(<Harness />);
    const flag = countryButton().querySelector('[aria-hidden="true"]');
    expect(flag?.textContent).toBe('\u{1F1EE}\u{1F1E9}');
  });

  it('takes another default country', () => {
    render(<Harness defaultCountry="MY" />);
    expect(countryButton().textContent).toContain('+60');
  });

  it('names the country in the UI language', () => {
    render(<Harness locale="id" defaultCountry="DE" countryLabel="Kode negara" />);
    expect(screen.getByRole('combobox', { name: 'Kode negara: Jerman +49' })).toBeTruthy();
  });

  it('uses a tel keyboard and is a single labelled number field', () => {
    render(<Harness />);
    expect(numberInput().type).toBe('tel');
    expect(numberInput().getAttribute('inputmode')).toBe('tel');
    expect(numberInput().getAttribute('autocomplete')).toBe('tel-national');
  });
});

describe('SNPhoneInput E.164 in and out', () => {
  it('shows an incoming E.164 number nationally and selects its country', () => {
    render(<Harness initial="+6281234567890" />);
    expect(numberInput().value).toBe('0812-3456-7890');
    expect(countryButton().textContent).toContain('+62');
  });

  it('selects the country of a foreign incoming number', () => {
    render(<Harness initial="+14155552671" />);
    expect(countryButton().textContent).toContain('+1');
    expect(countryButton().getAttribute('aria-label')).toBe('Country code: United States +1');
    expect(numberInput().value).toBe('(415) 555-2671');
  });

  it('emits E.164 while typing a national number', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('812 3456 7890');
    expect(onChange).toHaveBeenLastCalledWith('+6281234567890');
  });

  it('formats as you type', () => {
    render(<Harness defaultCountry="US" />);
    type('650253');
    expect(numberInput().value).toBe('(650) 253');
  });

  it('emits an empty string when the number is cleared', () => {
    const onChange = vi.fn();
    render(<Harness initial="+6281234567890" onChange={onChange} />);
    type('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('does not emit when nothing was typed', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows a value changed from outside, such as a discard', () => {
    function Outer() {
      const [value, setValue] = React.useState('+6281234567890');
      return (
        <>
          <button type="button" onClick={() => setValue('')}>
            reset
          </button>
          <SNPhoneInput aria-label="Phone number" value={value} onValueChange={setValue} {...labels} />
        </>
      );
    }
    render(<Outer />);
    expect(numberInput().value).toBe('0812-3456-7890');
    fireEvent.click(screen.getByText('reset'));
    expect(numberInput().value).toBe('');
    expect(countryButton().textContent).toContain('+62');
  });

  it('keeps the form value in a hidden input when it has a name', () => {
    const { container } = render(
      <form>
        <Harness name="phone_number" initial="+6281234567890" />
      </form>,
    );
    expect((container.querySelector('input[type="hidden"][name="phone_number"]') as HTMLInputElement).value).toBe('+6281234567890');
  });
});

describe('SNPhoneInput leading zero', () => {
  it('accepts the national 0 and emits the number without it', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('0812 3456 7890');
    expect(onChange).toHaveBeenLastCalledWith('+6281234567890');
  });

  it('applies the trunk prefix of the chosen country, not only Indonesia', () => {
    const onChange = vi.fn();
    render(<Harness defaultCountry="GB" onChange={onChange} />);
    type('07400 123456');
    expect(onChange).toHaveBeenLastCalledWith('+447400123456');
  });

  it('still reads an unfinished 0812 as +62812 (not valid yet)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('0812');
    expect(onChange).toHaveBeenLastCalledWith('+62812');
  });
});

describe('SNPhoneInput paste detection', () => {
  it('switches the country when a full +44 number is pasted', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('+44 7400 123456');
    expect(onChange).toHaveBeenLastCalledWith('+447400123456');
    expect(countryButton().getAttribute('aria-label')).toBe('Country code: United Kingdom +44');
    expect(numberInput().value.replace(/\D/g, '')).toBe('07400123456');
  });

  it('switches to the country of a shared code from the digits that follow', () => {
    render(<Harness />);
    type('+1 650 253 0000');
    expect(countryButton().getAttribute('aria-label')).toBe('Country code: United States +1');
  });

  it('keeps the country when the pasted code is already selected', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('+62 812 3456 7890');
    expect(onChange).toHaveBeenLastCalledWith('+6281234567890');
    expect(countryButton().textContent).toContain('+62');
  });
});

describe('SNPhoneInput invalid numbers', () => {
  it('emits a value the form can reject instead of dropping the input', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('0812 34');
    const value = onChange.mock.lastCall?.[0] as string;
    expect(value).not.toBe('');
    expect(ui.snIsValidPhoneNumber(value)).toBe(false);
  });

  it('marks the control invalid and describes it through an SNField error', () => {
    render(
      <SNField label="Phone number" error="Enter a valid phone number">
        <SNPhoneInput value="+62812" onValueChange={() => {}} {...labels} />
      </SNField>,
    );
    const input = screen.getByRole('textbox', { name: 'Phone number' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('Enter a valid phone number').id);
    expect(input.closest('[data-slot="phone-field"]')?.getAttribute('data-invalid')).toBe('true');
  });

  it('shares the field label with the number input, so clicking the label focuses it', () => {
    render(
      <SNField label="Phone number">
        <SNPhoneInput value="" onValueChange={() => {}} {...labels} />
      </SNField>,
    );
    const input = screen.getByRole('textbox', { name: 'Phone number' });
    // The label's `for` is the number input (not the country button), so a click on the label reaches it.
    expect(screen.getByLabelText('Phone number')).toBe(input);
    expect((screen.getByText('Phone number') as HTMLLabelElement).htmlFor).toBe(input.id);
  });

  it('reports blur from the number input', () => {
    const onBlur = vi.fn();
    render(<Harness onBlur={onBlur} />);
    fireEvent.blur(numberInput());
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    render(<Harness disabled />);
    expect(numberInput().disabled).toBe(true);
    expect((countryButton() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('SNPhoneInput country list', () => {
  it('opens a listbox with a labelled search box and Indonesia pinned first, then the favourites', async () => {
    render(<Harness />);
    const listbox = await openList();
    expect(search().getAttribute('placeholder')).toBe('Search country or code');
    expect(countryButton().getAttribute('aria-expanded')).toBe('true');
    const options = within(listbox).getAllByRole('option');
    expect(options.length).toBeGreaterThan(200);
    expect(options.slice(0, 5).map(plain)).toEqual([
      'Indonesia+62',
      'Malaysia+60',
      'Singapore+65',
      'Australia+61',
      'United States+1',
    ]);
    expect(plain(options[5])).toBe('Afghanistan+93');
  });

  it('hides the flags in the list from screen readers and marks the selected country', async () => {
    render(<Harness initial="+6591234567" />);
    await openList();
    const selected = screen.getAllByRole('option').find((option) => option.getAttribute('data-checked') === 'true');
    expect(plain(selected)).toBe('Singapore+65');
    expect(selected?.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('finds a country by name, ISO code, and dial code with or without plus', async () => {
    render(<Harness />);
    await openList();

    await searchFor('malay');
    expect(optionNames()).toEqual(['Malaysia+60']);

    await searchFor('62');
    expect(optionNames()).toEqual(['Indonesia+62']);

    await searchFor('+62');
    expect(optionNames()).toEqual(['Indonesia+62']);

    await searchFor('ID');
    expect(optionNames()[0]).toBe('Indonesia+62');

    await searchFor('+44');
    expect(optionNames()).toEqual(expect.arrayContaining(['United Kingdom+44']));
  });

  it('finds by the localized and the English name when the UI is Indonesian', async () => {
    render(<Harness locale="id" countryLabel="Kode negara" searchLabel="Cari negara" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: /^Kode negara/ }));
    });
    const input = screen.getByRole('combobox', { name: 'Cari negara' });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'jerman' } });
    });
    expect(optionNames()).toEqual(['Jerman+49']);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'germany' } });
    });
    expect(optionNames()).toEqual(['Jerman+49']);
  });

  it('shows the empty state when nothing matches', async () => {
    render(<Harness />);
    await openList();
    await searchFor('zzzzqq');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No country found')).toBeTruthy();
    expect(screen.getByText('Try a name, a code like ID or a dial code like +62.')).toBeTruthy();
  });

  it('chooses a country with a click, keeps the typed digits and moves focus to the number', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('9123 4567');
    onChange.mockClear();
    await openList();
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Singapore/ }));
    });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(countryButton().getAttribute('aria-label')).toBe('Country code: Singapore +65');
    expect(onChange).toHaveBeenLastCalledWith('+6591234567');
    await waitFor(() => expect(document.activeElement).toBe(numberInput()));
  });

  it('clears the search when it closes', async () => {
    render(<Harness />);
    await openList();
    await searchFor('malay');
    await act(async () => {
      fireEvent.keyDown(search(), { key: 'Escape' });
    });
    await openList();
    expect(search().value).toBe('');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(200);
  });
});

describe('SNPhoneInput keyboard and screen reader support', () => {
  it('uses combobox semantics: the search box points at the active option', async () => {
    render(<Harness />);
    const listbox = await openList();
    expect(search().getAttribute('aria-controls')).toBe(listbox.id);
    const active = () => document.getElementById(search().getAttribute('aria-activedescendant') ?? '');
    // cmdk publishes the active id after its first effect, so wait for it.
    await waitFor(() => expect(plain(active())).toBe('Indonesia+62'));
    expect(active()?.getAttribute('aria-selected')).toBe('true');
    await act(async () => {
      fireEvent.keyDown(search(), { key: 'ArrowDown' });
    });
    expect(plain(active())).toBe('Malaysia+60');
    await act(async () => {
      fireEvent.keyDown(search(), { key: 'ArrowUp' });
    });
    expect(plain(active())).toBe('Indonesia+62');
  });

  it('chooses the highlighted country with Enter', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('9123 4567');
    onChange.mockClear();
    await openList();
    await searchFor('sing');
    await act(async () => {
      fireEvent.keyDown(search(), { key: 'Enter' });
    });
    expect(countryButton().getAttribute('aria-label')).toBe('Country code: Singapore +65');
    expect(onChange).toHaveBeenLastCalledWith('+6591234567');
  });

  it('moves with the arrows and chooses with Enter', async () => {
    render(<Harness />);
    await openList();
    await act(async () => {
      fireEvent.keyDown(search(), { key: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(search(), { key: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(search(), { key: 'Enter' });
    });
    expect(countryButton().getAttribute('aria-label')).toBe('Country code: Singapore +65');
  });

  it('closes on Escape and gives focus back to the country button', async () => {
    render(<Harness />);
    await openList();
    await act(async () => {
      fireEvent.keyDown(search(), { key: 'Escape' });
    });
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(countryButton()));
  });
});

describe('SNPhoneInput gallery', () => {
  it('has a gallery entry exported from @sineva/ui/gallery', () => {
    expect(galleries.SNPhoneInputGallery).toBe(SNPhoneInputGallery);
  });

  it('renders every state: default, filled, foreign, error, disabled', () => {
    render(<SNPhoneInputGallery />);
    expect(screen.getByRole('heading', { name: 'SNPhoneInput' })).toBeTruthy();
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(5);
    expect(document.querySelectorAll('[data-slot="phone-field"][data-invalid="true"]').length).toBe(1);
    expect(screen.getAllByRole('textbox').some((input) => (input as HTMLInputElement).disabled)).toBe(true);
  });
});

describe('SNPhoneInput is exported from @sineva/ui', () => {
  it('exports the component and the validity helper', () => {
    expect(ui.SNPhoneInput).toBe(SNPhoneInput);
    expect(ui.snIsValidPhoneNumber('+6281234567890')).toBe(true);
  });
});
