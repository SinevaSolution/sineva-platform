# Workflow validator fixtures

Shared between the platform validator (`src/shared/workflows/validate.ts`) and the
sineva-ai validator (ADR-0045). Each file is one case:

- `context`: what the validator knows about the workspace (enabled specialists,
  connections, the action catalog, whether the draft was generated, whether the
  person asked for a send, whether the editor may raise the loop cap).
- `definition`: the input, possibly malformed on purpose.
- `expected_codes`: the set of issue codes the validator must report (an empty
  list means the definition is valid). Order and repeats do not matter.

Both validators must agree on every file. Copy this folder to sineva-ai
unchanged; a new case lands here first.
