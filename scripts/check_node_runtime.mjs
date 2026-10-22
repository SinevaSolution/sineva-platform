import { readFileSync } from 'node:fs';

const minimum = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
const required = minimum.split('.').map(Number);
const actual = process.versions.node.split('.').map(Number);
const sameMajor = actual[0] === required[0];
const patched = actual[1] > required[1] || (actual[1] === required[1] && actual[2] >= required[2]);

if (!sameMajor || !patched) {
  console.error(
    `Node ${process.versions.node} is unsupported. Run nvm install && nvm use; Node ${minimum} or a newer patch in the same major line is required (CVE-2026-111497).`,
  );
  process.exitCode = 1;
} else {
  console.log(`Node ${process.versions.node}: patched runtime baseline satisfied.`);
}
