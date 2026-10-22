// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNTooltipProvider } from '../sn_tooltip/sn_tooltip';
import { SNInput } from './sn_input';

beforeAll(installDomPolyfills);

afterEach(cleanup);

describe('SNInput', () => {
  it('renders a textbox with its accessible name', () => {
    render(<SNInput aria-label="Name" />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
  });

  it('is 44 px tall with 16 px type on coarse pointers', () => {
    render(<SNInput aria-label="Name" />);
    const cls = screen.getByRole('textbox').className;
    expect(cls).toContain('h-11');
    expect(cls).toContain('pointer-coarse:text-base');
  });

  it('passes autocomplete and inputmode through', () => {
    render(<SNInput aria-label="Phone" type="tel" inputMode="tel" autoComplete="tel" />);
    const input = screen.getByRole('textbox', { name: 'Phone' });
    expect(input.getAttribute('inputmode')).toBe('tel');
    expect(input.getAttribute('autocomplete')).toBe('tel');
  });

  it('calls onChange with typed text', () => {
    const onChange = vi.fn();
    render(<SNInput aria-label="Name" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sino' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('sets aria-invalid only when asked', () => {
    const { rerender } = render(<SNInput aria-label="Name" />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBeNull();
    rerender(<SNInput aria-label="Name" aria-invalid />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  });

  it('supports read-only and disabled', () => {
    const { rerender } = render(<SNInput aria-label="Name" readOnly defaultValue="x" />);
    expect((screen.getByRole('textbox') as HTMLInputElement).readOnly).toBe(true);
    rerender(<SNInput aria-label="Name" disabled />);
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('renders start and end adornments around the input', () => {
    render(<SNInput aria-label="Search" startAdornment={<span data-testid="start" />} endAdornment={<span data-testid="end" />} />);
    expect(screen.getByTestId('start')).toBeTruthy();
    expect(screen.getByTestId('end')).toBeTruthy();
  });

  it('forwards a ref to the input element', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<SNInput aria-label="Name" ref={ref} />);
    expect(ref.current?.tagName).toBe('INPUT');
  });

  describe('password variant', () => {
    function setup() {
      return render(
        <SNTooltipProvider>
          <SNInput aria-label="Password" type="password" showLabel="Show password" hideLabel="Hide password" />
        </SNTooltipProvider>,
      );
    }

    it('starts masked with a show toggle', () => {
      setup();
      expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('password');
      expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy();
    });

    it('reveals and re-hides the value, naming the toggle for the next action', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('text');
      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('password');
    });

    it('keeps the toggle out of the form submit path', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Show password' }).getAttribute('type')).toBe('button');
    });

    it('has no toggle when the labels are not given', () => {
      render(<SNInput aria-label="Password" type="password" />);
      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});
