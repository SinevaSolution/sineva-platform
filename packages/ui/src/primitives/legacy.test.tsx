// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge, Button, Card, StatusPill } from './legacy';

afterEach(cleanup);

// Smoke test for the Testing Library and jsdom rail in packages/ui. The legacy
// primitives stay until WP-M0-39 replaces them; this only proves they render
// and keep their accessible names.
describe('legacy primitives under jsdom', () => {
  it('renders a button with its accessible name', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('renders a link through asChild', () => {
    render(
      <Button asChild>
        <a href="/docs">Docs</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe('/docs');
  });

  it('renders a status pill with the label and a hidden dot', () => {
    const { container } = render(<StatusPill status="online" label="API online" />);
    expect(screen.getByText('API online')).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('renders badge and card content', () => {
    render(
      <Card>
        <Badge tone="neutral">Beta</Badge>
      </Card>,
    );
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('uses only semantic token classes (no removed platform tokens)', () => {
    const { container } = render(
      <Card elevated>
        <Button variant="ghost">x</Button>
        <Badge tone="success">ok</Badge>
      </Card>,
    );
    const html = container.innerHTML;
    for (const removed of ['surface-elevated', 'surface-muted', 'text-muted', 'emerald', 'dark:']) {
      expect(html).not.toContain(removed);
    }
  });
});
