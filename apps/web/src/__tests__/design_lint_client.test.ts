import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// FR-DS-04: the design rules that guard packages/ui also guard src/client.
// The code is linted as a virtual file at a client path, so the normal lint
// run never sees the violation.
const WEB_ROOT = resolve(import.meta.dirname, '../..');
const CLIENT_FILE = resolve(WEB_ROOT, 'src/client/components/zz_lint_probe.tsx');

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: WEB_ROOT });
});

async function ruleIds(code: string, filePath = CLIENT_FILE): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  expect(result!.messages.filter((m) => m.fatal).map((m) => m.message)).toEqual([]);
  return result!.messages.map((m) => m.ruleId ?? 'parse');
}

const jsx = (className: string) => `export const X = () => <span className="${className}">x</span>;\n`;

describe('src/client design lint rules (FR-DS-04, FR-UX-05)', () => {
  it.each([
    ['a hex color', jsx('bg-[#00686d]'), 'sineva-design/no-raw-color'],
    ['rgb()', jsx('shadow-[0_1px_2px_rgba(0,0,0,0.2)]'), 'sineva-design/no-raw-color'],
    ['a palette class', jsx('text-white'), 'sineva-design/no-raw-color'],
    ['a dark: class', jsx('bg-surface dark:bg-canvas'), 'sineva-design/no-dark-variant'],
    ['an arbitrary z-index', jsx('z-[50]'), 'sineva-design/no-arbitrary-z'],
    ['a numeric z-index', jsx('z-50'), 'sineva-design/no-arbitrary-z'],
    ['a physical margin', jsx('ml-2'), 'sineva-design/no-physical-direction'],
    ['a physical position', jsx('absolute left-0'), 'sineva-design/no-physical-direction'],
    ['text-left', jsx('text-left'), 'sineva-design/no-physical-direction'],
    [
      'a motion import',
      "import { motion } from 'motion/react';\nexport const X = () => <motion.span />;\n",
      'sineva-design/no-motion-import',
    ],
    [
      'dangerouslySetInnerHTML',
      'export const X = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;\n',
      'sineva-design/no-dangerous-html',
    ],
    [
      'a server import',
      "import { x } from '@/server/container';\nexport const X = () => <span>{String(x)}</span>;\n",
      'no-restricted-imports',
    ],
  ])('fails %s', async (_name, code, ruleId) => {
    expect(await ruleIds(code)).toContain(ruleId);
  });

  it('passes token classes, logical properties and token z-index', async () => {
    const ids = await ruleIds(
      jsx('z-(--z-dropdown) ms-2 ps-3 text-start bg-surface text-text-secondary rounded-sm hover:bg-(--state-hover)'),
    );
    expect(ids.filter((id) => id.startsWith('sineva-design/'))).toEqual([]);
  });

  it('does not apply to server code, which has its own rules', async () => {
    const serverFile = resolve(WEB_ROOT, 'src/server/zz_lint_probe.ts');
    const ids = await ruleIds("export const color = '#00686d';\n", serverFile);
    expect(ids.filter((id) => id.startsWith('sineva-design/'))).toEqual([]);
  });
});
