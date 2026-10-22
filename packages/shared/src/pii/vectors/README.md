# PII test vectors

`pii_vectors.json` is the single definition of what counts as an Indonesian personal identifier or a secret in logs, traces and evals. The TypeScript detectors in `../` and the Python filter in `sineva-ai` (`infrastructure/logging/pii_filter.py`) must pass the same file.

## Source of truth and sync

- The plan says the file originates in `sineva-ai`. That repo is owned by another team and has not shipped its copy yet, so the file was created here with the platform half of the work. **`sineva-ai` must copy it byte for byte** (for example to `tests/fixtures/pii_vectors.json`) and must not edit its copy. Change the file in one place and copy it to the other in the same change.
- `vectors_drift.test.ts` compares this file with the sineva-ai copy. It is **skipped with a visible reason** until the copy exists (the test title says `SKIPPED` and where it looked). Set `SINEVA_AI_PII_VECTORS` to an absolute path to compare against a copy at another location. Default lookup: `<repo root>/../sineva-ai/tests/fixtures/pii_vectors.json`.
- Only this README may differ between the repos.

## Format

- `placeholders`: the stable replacement per kind. `mask()` output uses exactly these.
- `cases[]`: `id`, `description`, `input`, `expected_matches` (kind and exact matched text, in order of position) and `expected_masked`.
- Negative cases have `expected_matches: []` and `expected_masked` equal to `input`.
- Kinds: `nik`, `npwp`, `phone`, `bank_account`, `email`, `secret`.

## Rules the vectors encode

- NIK: 16 digits with a structure check (province, day with the female +40 offset, month, non-zero serial) unless a keyword (`NIK`, `KTP`) precedes it. A 16 digit run that fails the check and has no keyword is an order number, not a NIK.
- NPWP: formatted `NN.NNN.NNN.N-NNN.NNN` always; plain 15 or 16 digits only after an `NPWP` keyword.
- Phone: Indonesian mobile numbers in `+62`, `62` and `0` forms, with space, dot or dash separators. Landlines are not covered.
- Bank account: 8 to 16 digits (grouping allowed) only after a rekening or bank keyword.
- Secrets: `snv_pat_`, PEM blocks (also truncated ones), bearer tokens, and the provider key prefixes in the vectors.

Fake secrets in the file are synthetic and must stay recognisably fake.
