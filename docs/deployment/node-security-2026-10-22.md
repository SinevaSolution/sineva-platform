---
title: 'Node.js Security Patch, 22 October 2026'
category: 'deployment'
status: 'active'
version: '1.0.0'
last_updated: '2026-10-22'
owner: 'Sineva Engineering'
tags: ['nodejs', 'security', 'cve', 'runtime']
summary: 'CVE-2026-111497 remediation, runtime verification and remaining deployment responsibilities.'
related_docs:
  - 'ci_cd_pipeline.md'
  - '../development/implementation-plan-alignment-2026-10-22.md'
---

# Node.js security patch

## Advisory and fix

The [official Node.js advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) identifies CVE-2026-111497 as a High-severity Brotli decoder out-of-bounds write that permits remote code execution. The [Node 24.22.1 release notes](https://nodejs.org/en/blog/release/v24.22.1) include its fix. This project stays on Node 24 and adopts 24.22.1 as its minimum patched version.

The initial local runtime and `.nvmrc` were 24.21.0. Docker used the floating `node:24-alpine` tag, while CI selected the latest Node 24 independently of the local pin.

## Changes and verification

- Installed Node 24.22.1 using the existing nvm installation; its download checksum matched. Project shell checks now report `v24.22.1`.
- Pinned `.nvmrc` to 24.22.1, package engine to `^24.22.1`, Docker base to `node:24.22.1-alpine`, and CI to `.nvmrc`.
- Added `scripts/check_node_runtime.mjs` to reject older or different-major runtimes before install, root dev/build and workspace dev/start. Direct `npx next` commands must still use a patched interpreter.
- Confirmed that the guard rejects the existing 24.21.0 binary and accepts 24.22.1. Two configuration regression tests failed before the patch and pass after it.
- Pulled the Docker base image and verified `node --version` inside a disposable container: `v24.22.1`. Image manifest digest: `sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53`.
- Built the application image `sineva-platform:20261022-node-security` successfully. A disposable run reports Node `v24.22.1` and uid `1001`; no persistent service was replaced.
- `npm audit --omit=dev`: zero reported vulnerabilities. This audit checks npm dependencies; it does not replace checking the Node binary version.

The full development-dependency audit reports five High findings through `eslint-config-next` / `fast-glob` / `micromatch` / `braces`. They trace to [CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), for which the advisory lists no patched braces version. The audit suggests downgrading the Next ESLint configuration to a different major. This batch records that separate finding and preserves the matching Next 16.4 lint configuration; it does not claim the full development audit is clean.

## Runtime rollout

Run `nvm install && nvm use` in an existing terminal before launching the application. Restart any already-running process to replace its Node interpreter. No listener was found on port 3001 during this review, and no local dev server was started.

An existing deployed application image/process remains vulnerable until its own runtime is rebuilt and replaced. This review does not assert that any remote deployment was patched. Rebuild from the updated Dockerfile and verify the running application with `node --version`; do not reset the shared database or its volumes.
