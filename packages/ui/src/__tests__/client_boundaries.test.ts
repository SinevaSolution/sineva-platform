import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const root = resolve(import.meta.dirname, '..');
function sources(dir: string): string[] {
 return readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? sources(path) : /\.[tj]sx?$/.test(name) && !/\.(test|gallery)\./.test(name) ? [path] : []; });
}
const clientDirective = /^\s*(['"])use client\1;/;
describe('React Server Component boundaries', () => {
 it('marks context providers and browser-only React hooks as client modules', () => {
  const invalid = sources(root).filter((path) => !path.includes('/__tests__/')).filter((path) => {
   const code = readFileSync(path, 'utf8');
   return /React\.(?:createContext|useContext|useState|useEffect|useLayoutEffect|useRef|useSyncExternalStore|useImperativeHandle)\s*[<(]/.test(code) && !clientDirective.test(code);
  });
  expect(invalid.map((path) => relative(root, path))).toEqual([]);
 });
 it('keeps SNField inside the client boundary where it consumes FieldContext.Provider', () => {
  expect(readFileSync(join(root, 'primitives/sn_field/sn_field.tsx'), 'utf8')).toMatch(clientDirective);
 });
});
