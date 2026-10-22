// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNSinoStill, type SNSinoStillPose } from './sn_sino_still';

afterEach(cleanup);

const POSES: SNSinoStillPose[] = ['confused', 'thumbs-up', 'wave', 'relaxed'];

describe('SNSinoStill', () => {
  it.each(POSES)('pose %s uses the v011 AVIF with a WebP fallback', (pose) => {
    const { container } = render(<SNSinoStill pose={pose} />);
    expect(container.querySelector('source')?.getAttribute('srcset')).toBe(`/mascot/v011/sino-${pose}.avif`);
    expect(container.querySelector('source')?.getAttribute('type')).toBe('image/avif');
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`/mascot/v011/sino-${pose}.webp`);
  });

  it('is decorative by default', () => {
    const { container } = render(<SNSinoStill pose="wave" />);
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('takes an alt when the pose carries meaning', () => {
    const { container } = render(<SNSinoStill pose="confused" alt="Sino looks confused" />);
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Sino looks confused');
  });

  it('defaults to 160 px and clamps larger sizes to 160', () => {
    const { container, rerender } = render(<SNSinoStill pose="wave" />);
    expect(container.querySelector('img')?.getAttribute('width')).toBe('160');
    rerender(<SNSinoStill pose="wave" size={400} />);
    expect(container.querySelector('img')?.getAttribute('width')).toBe('160');
    expect((container.firstElementChild as HTMLElement).style.width).toBe('160px');
  });

  it('keeps smaller sizes', () => {
    const { container } = render(<SNSinoStill pose="wave" size={96} />);
    expect(container.querySelector('img')?.getAttribute('height')).toBe('96');
  });

  it('draws the teal glow and a contact shadow, both aria-hidden', () => {
    const { container } = render(<SNSinoStill pose="wave" />);
    expect(container.querySelector('[data-part="glow"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-part="glow"]')?.className).toContain('--gradient-glow-teal');
    expect(container.querySelector('[data-part="shadow"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the orbit ring only when asked', () => {
    const { container, rerender } = render(<SNSinoStill pose="wave" />);
    expect(container.querySelector('[data-part="orbit"]')).toBeNull();
    rerender(<SNSinoStill pose="wave" orbit />);
    expect(container.querySelector('[data-part="orbit"]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
