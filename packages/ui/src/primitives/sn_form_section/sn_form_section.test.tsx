// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNFormSection } from './sn_form_section';

afterEach(cleanup);

describe('SNFormSection', () => {
  it('is a labelled region with its title as a heading', () => {
    render(
      <SNFormSection title="Region">
        <p>content</p>
      </SNFormSection>,
    );
    expect(screen.getByRole('region', { name: 'Region' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Region' })).toBeTruthy();
  });

  it('renders an optional description', () => {
    render(
      <SNFormSection title="Region" description="Language and time">
        <p>content</p>
      </SNFormSection>,
    );
    expect(screen.getByText('Language and time')).toBeTruthy();
  });

  it('uses the heading level it is given', () => {
    render(
      <SNFormSection title="Region" headingLevel={3}>
        <p>content</p>
      </SNFormSection>,
    );
    expect(screen.getByRole('heading', { level: 3 })).toBeTruthy();
  });

  it('renders its children', () => {
    render(
      <SNFormSection title="Region">
        <p>content</p>
      </SNFormSection>,
    );
    expect(screen.getByText('content')).toBeTruthy();
  });
});
