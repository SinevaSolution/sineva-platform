// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SNAvatar, snAvatarInitials } from './sn_avatar';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('snAvatarInitials', () => {
  it.each([
    ['Faishal Rahman', undefined, 'FR'],
    ['  ada   lovelace byron ', undefined, 'AL'],
    ['madonna', undefined, 'M'],
    ['', 'zed@x.io', 'Z'],
    ['   ', 'zed@x.io', 'Z'],
    ['', undefined, ''],
    ['', '', ''],
  ] as const)('(%j, %j) gives %j', (name, email, expected) => {
    expect(snAvatarInitials(name, email)).toBe(expected);
  });
});

describe('SNAvatar fallback', () => {
  it('names itself by `name` and shows initials with the app avatar look', () => {
    render(<SNAvatar name="Faishal Rahman" />);
    const el = screen.getByRole('img', { name: 'Faishal Rahman' });
    expect(el.textContent).toBe('FR');
    for (const cls of ['rounded-full', 'text-text-brand', 'font-semibold']) {
      expect(el.className.split(' ')).toContain(cls);
    }
  });

  it('uses the email initial when the name is empty', () => {
    render(<SNAvatar name="" email="zed@x.io" />);
    expect(screen.getByText('Z')).toBeTruthy();
  });

  it.each([
    ['xs', 'size-6'],
    ['sm', 'size-7'],
    ['md', 'size-9'],
    ['lg', 'size-12'],
    ['xl', 'size-16'],
  ] as const)('size %s is %s', (size, cls) => {
    const { container } = render(<SNAvatar name="A B" size={size} />);
    expect((container.firstElementChild as HTMLElement).className.split(' ')).toContain(cls);
  });

  it('defaults to md', () => {
    const { container } = render(<SNAvatar name="A B" />);
    expect((container.firstElementChild as HTMLElement).className.split(' ')).toContain('size-9');
  });

  it('decorative hides the whole avatar from assistive tech', () => {
    const { container } = render(<SNAvatar name="Faishal Rahman" decorative />);
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('SNAvatar image', () => {
  beforeEach(() => {
    // Radix probes the URL with `new Image()` and reads `complete` and
    // `naturalWidth` right after setting `src`; jsdom never loads images, so
    // the stub reports an already-loaded one.
    class LoadedImage {
      complete = true;
      naturalWidth = 16;
      referrerPolicy = '';
      crossOrigin: string | null = null;
      src = '';
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal('Image', LoadedImage);
    (window as unknown as { Image: unknown }).Image = LoadedImage;
  });

  it('uses the name as alt text', async () => {
    const { container } = render(<SNAvatar name="Faishal Rahman" src="/me.png" />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Faishal Rahman');
  });

  it('decorative uses an empty alt', async () => {
    const { container } = render(<SNAvatar name="Faishal Rahman" src="/me.png" decorative />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });
});
