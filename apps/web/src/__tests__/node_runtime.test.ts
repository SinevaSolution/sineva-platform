import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('CVE-2026-111497 runtime baseline', () => {
  it('requires the patched Node 24 release locally and in package metadata', () => {
    const version = read('.nvmrc').trim();
    const [major, minor, patch] = version.split('.').map(Number);
    expect(major).toBe(24);
    expect(minor! > 22 || (minor === 22 && patch! >= 1)).toBe(true);
    expect(JSON.parse(read('package.json')).engines.node).toBe(`^${version}`);
    expect(JSON.parse(read('package-lock.json')).packages[''].engines.node).toBe(`^${version}`);
  });

  it('uses the same patched runtime for all Docker stages and CI jobs', () => {
    const version = read('.nvmrc').trim();
    expect(read('Dockerfile')).toContain(`FROM node:${version}-alpine AS base`);
    const ci = read('.github/workflows/ci.yml');
    expect(ci.match(/node-version-file: '\.nvmrc'/g)).toHaveLength(3);
    expect(ci).not.toMatch(/node-version: ['"]?24/);
  });
});
