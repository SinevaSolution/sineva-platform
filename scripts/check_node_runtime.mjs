import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Decides whether a Node version satisfies the baseline in `.nvmrc`.
 *
 * Everywhere we control the runtime (local, Docker, CI) the patch level is
 * enforced (CVE-2026-111497). Vercel only offers the major (`24.x`) and rolls
 * patch releases out itself, so there an older patch cannot be fixed from this
 * repository: it warns instead of failing the build, and the major is still
 * enforced. The Vercel runbook has the build-log check.
 */
export function evaluateRuntime({ minimum, actual, onVercel }) {
  const required = minimum.split('.').map(Number);
  const current = actual.split('.').map(Number);
  const sameMajor = current[0] === required[0];
  const patched =
    current[1] > required[1] || (current[1] === required[1] && current[2] >= required[2]);

  if (!sameMajor) {
    return {
      ok: false,
      message: `Node ${actual} is unsupported. Run nvm install && nvm use; Node ${minimum} or a newer patch in the same major line is required (CVE-2026-111497).`,
    };
  }
  if (!patched && onVercel) {
    return {
      ok: true,
      message: `Node ${actual}: same major as ${minimum}.`,
      warning: `Node ${actual} is older than the patched baseline ${minimum} (CVE-2026-111497). Vercel manages the patch level of ${current[0]}.x; check the build log and ask Vercel support or switch hosting if it stays behind.`,
    };
  }
  if (!patched) {
    return {
      ok: false,
      message: `Node ${actual} is unsupported. Run nvm install && nvm use; Node ${minimum} or a newer patch in the same major line is required (CVE-2026-111497).`,
    };
  }
  return { ok: true, message: `Node ${actual}: patched runtime baseline satisfied.` };
}

// Run as a script (`preinstall`, `predev`, `prebuild`), not when imported by a test.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const minimum = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
  const result = evaluateRuntime({
    minimum,
    actual: process.versions.node,
    onVercel: process.env.VERCEL === '1',
  });
  if (result.warning) console.warn(result.warning);
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exitCode = 1;
  }
}
