// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNInput } from '../sn_input/sn_input';
import { SNField } from './sn_field';

afterEach(cleanup);

describe('SNField', () => {
  it('labels the control inside it', () => {
    render(
      <SNField label="Email">
        <SNInput />
      </SNField>,
    );
    expect(screen.getByLabelText('Email').tagName).toBe('INPUT');
  });

  it('describes the control with the helper text', () => {
    render(
      <SNField label="Email" hint="We never share it">
        <SNInput />
      </SNField>,
    );
    const input = screen.getByLabelText('Email');
    const hint = screen.getByText('We never share it');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('sets aria-invalid only when there is an error', () => {
    const { rerender } = render(
      <SNField label="Email">
        <SNInput />
      </SNField>,
    );
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
    rerender(
      <SNField label="Email" error="Not an email">
        <SNInput />
      </SNField>,
    );
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('points aria-describedby at the error and hides the helper while it shows', () => {
    render(
      <SNField label="Email" hint="We never share it" error="Not an email">
        <SNInput />
      </SNField>,
    );
    const input = screen.getByLabelText('Email');
    const error = screen.getByText('Not an email');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(screen.queryByText('We never share it')).toBeNull();
  });

  it('announces the error politely', () => {
    render(
      <SNField label="Email" error="Not an email">
        <SNInput />
      </SNField>,
    );
    expect(screen.getByText('Not an email').getAttribute('role')).toBe('alert');
  });

  it('uses the id given to the field for the control and its label', () => {
    render(
      <SNField label="Email" id="my-email">
        <SNInput />
      </SNField>,
    );
    expect(screen.getByLabelText('Email').id).toBe('my-email');
  });

  it('renders a trailing node beside the label', () => {
    render(
      <SNField label="Password" trailing={<a href="/forgot">Forgot?</a>}>
        <SNInput />
      </SNField>,
    );
    expect(screen.getByRole('link', { name: 'Forgot?' })).toBeTruthy();
  });

  it('passes required to the control', () => {
    render(
      <SNField label="Email" required>
        <SNInput />
      </SNField>,
    );
    expect((screen.getByLabelText('Email') as HTMLInputElement).required).toBe(true);
  });

  it('joins its description with a describedby the control already has', () => {
    render(
      <SNField label="Email" hint="Hint">
        <SNInput aria-describedby="extra" />
      </SNField>,
    );
    const ids = (screen.getByLabelText('Email').getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain('extra');
    expect(ids).toContain(screen.getByText('Hint').id);
  });
});
