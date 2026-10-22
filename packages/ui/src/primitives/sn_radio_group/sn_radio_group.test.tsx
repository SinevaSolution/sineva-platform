// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNRadioGroup } from './sn_radio_group';

afterEach(cleanup);

const options = [
  { value: 'comfortable', label: 'Comfortable', description: 'More air' },
  { value: 'compact', label: 'Compact' },
  { value: 'dense', label: 'Dense', disabled: true },
];

function setup(props: Partial<React.ComponentProps<typeof SNRadioGroup>> = {}) {
  const onValueChange = vi.fn();
  render(
    <SNRadioGroup aria-label="Density" name="density" value="comfortable" onValueChange={onValueChange} options={options} {...props} />,
  );
  return { onValueChange };
}

describe('SNRadioGroup', () => {
  it('is a radiogroup with a name', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'Density' })).toBeTruthy();
  });

  it('renders one radio per option, named by its label', () => {
    setup();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Comfortable/ })).toBeTruthy();
  });

  it('checks the radio that matches the value', () => {
    setup({ value: 'compact' });
    expect((screen.getByRole('radio', { name: 'Compact' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /Comfortable/ }) as HTMLInputElement).checked).toBe(false);
  });

  it('reports the chosen value', () => {
    const { onValueChange } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    expect(onValueChange).toHaveBeenCalledWith('compact');
  });

  it('clicking a label chooses its radio', () => {
    const { onValueChange } = setup();
    fireEvent.click(screen.getByText('Compact'));
    expect(onValueChange).toHaveBeenCalledWith('compact');
  });

  it('does not choose a disabled option', () => {
    const { onValueChange } = setup();
    const dense = screen.getByRole('radio', { name: 'Dense' }) as HTMLInputElement;
    expect(dense.disabled).toBe(true);
    fireEvent.click(dense);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('describes a radio with its description', () => {
    setup();
    const radio = screen.getByRole('radio', { name: /Comfortable/ });
    expect(radio.getAttribute('aria-describedby')).toBe(screen.getByText('More air').id);
  });

  it('shares one name so the browser provides arrow-key movement', () => {
    setup();
    for (const radio of screen.getAllByRole('radio')) expect(radio.getAttribute('name')).toBe('density');
  });

  it('renders cards when asked, with the same semantics', () => {
    setup({ variant: 'cards' });
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    const label = screen.getByText('Compact').closest('label');
    expect(label?.className).toContain('rounded-md');
  });

  it('keeps every option row at least 44 px tall', () => {
    setup();
    expect(screen.getByText('Compact').closest('label')?.className).toContain('min-h-11');
  });
});
