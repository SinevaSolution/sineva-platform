// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_SCRIPT } from '@sineva/ui/theme';
import { ThemeScript } from '@/client/components/theme_script';
const insertion = vi.hoisted(() => ({ callbacks: [] as Array<() => React.ReactNode> }));
vi.mock('next/navigation', () => ({ useServerInsertedHTML: (callback: () => React.ReactNode) => insertion.callbacks.push(callback) }));
afterEach(() => { cleanup(); insertion.callbacks.length = 0; vi.restoreAllMocks(); });
describe('ThemeScript server insertion', () => {
 it('renders no script in the hydrated client tree', () => {
  const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { container } = render(<ThemeScript nonce="abc123" />);
  expect(container.querySelector('script')).toBeNull(); expect(warn).not.toHaveBeenCalled();
 });
 it('inserts the constant theme code once through the server hook with the CSP nonce', () => {
  render(<ThemeScript nonce="abc123" />);
  expect(insertion.callbacks).toHaveLength(1);
  const element = insertion.callbacks[0]() as React.ReactElement<{ nonce?: string; id: string; children: string }>;
  expect(element.type).toBe('script'); expect(element.props.id).toBe('sineva-theme');
  expect(element.props.nonce).toBe('abc123'); expect(element.props.children).toBe(THEME_SCRIPT);
  expect(insertion.callbacks[0]()).toBeNull();
 });
 it('omits the nonce when none was supplied', () => {
  render(<ThemeScript />);
  const element = insertion.callbacks[0]() as React.ReactElement<{ nonce?: string }>;
  expect(element.props.nonce).toBeUndefined();
 });
});
