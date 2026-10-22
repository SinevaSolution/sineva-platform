// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ComponentGallery } from '@/client/components/dev_ui/gallery';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

it('WP-M0-41 applies query locale/theme and restores the host page attributes on unmount', () => {
  document.documentElement.lang = 'en';
  document.documentElement.dataset.theme = 'light';
  const view = render(
    <ComponentGallery theme="dark" locale="id" pseudo={false} width={390} component="SNButton" />,
  );
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Galeri komponen');
  expect(screen.getAllByText('Nonaktif')).toHaveLength(6);
  expect(document.documentElement.lang).toBe('id');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(screen.getByTestId('component-gallery').style.maxWidth).toBe('390px');
  view.unmount();
  expect(document.documentElement.lang).toBe('en');
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('WP-M0-41 expands fixture labels through the existing pseudo-locale generator', () => {
  render(<ComponentGallery theme="light" locale="en" pseudo width={360} component="SNButton" />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^\[.*\]$/);
  expect(screen.queryByText('Disabled')).toBeNull();
  expect(screen.getAllByText(/Ðîšàƀľéð/)).toHaveLength(6);
});
