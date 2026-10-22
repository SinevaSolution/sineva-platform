import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';

const root = path.resolve(__dirname, '../..');

describe('app icons and manifest', () => {
  it('ships the Next.js icon files (favicon, icon, apple icon)', () => {
    for (const f of ['src/app/favicon.ico', 'src/app/icon.png', 'src/app/apple-icon.png']) {
      expect(existsSync(path.join(root, f)), f).toBe(true);
    }
  });

  it('points every manifest icon at a file that exists', () => {
    const m = manifest();
    expect(m.name).toBe('Sineva');
    expect(m.start_url).toBe('/');
    expect(m.icons?.length).toBeGreaterThan(0);
    for (const icon of m.icons ?? []) {
      expect(existsSync(path.join(root, 'public', icon.src)), icon.src).toBe(true);
    }
  });
});
