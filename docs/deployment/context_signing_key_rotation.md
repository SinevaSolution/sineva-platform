---
title: "Runbook: Context Signing Key Rotation (Ed25519 / EdDSA)"
category: "deployment"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Security & Infrastructure"
tags: ["sineva", "security", "runbook", "key-rotation", "eddsa", "ed25519", "signed-context"]
summary: "Step-by-step operational runbook for zero-downtime rotation of asymmetric Ed25519 context signing keys (WP-M0-27, FR-SEC-02, FR-SEC-39)."
related_docs:
  - "secret_inventory.md"
  - "internal_network_security.md"
  - "environment_variables.md"
---

# Runbook: Context Signing Key Rotation (Ed25519 / EdDSA)

This operational runbook defines the procedure for rotating asymmetric Ed25519 cryptographic keys used by `sineva-platform` to mint short-lived `X-Sineva-Context` JWS tokens for `sineva-ai` (FR-SEC-01, FR-SEC-02, FR-SEC-39).

## 1. Overview & Rotation Invariants

1. **Algorithm**: EdDSA with Curve25519 (`Ed25519`).
2. **Token Lifetime**: 60 seconds (`exp = iat + 60`).
3. **Key Identifier**: Identified by unique `kid` in JWS header (e.g. `k20261101_01`).
4. **Dual Key Overlap (Zero Downtime)**:
   - `sineva-ai` accepts both the currently active public key and the new/next public key.
   - The platform switches active private key only after `sineva-ai` has loaded the new public key.
   - The old key remains valid in verification stores for at least 120 seconds (2x token lifetime) before being retired.
5. **Private Key Secrecy**: The private key is NEVER saved to the database. It is injected into `sineva-platform` exclusively via secret manager / environment variable (`INTERNAL_CONTEXT_SIGNING_KEY`).

---

## 2. Step-by-Step Rotation Procedure

### Phase A: Generate New Ed25519 Key Pair

Generate a high-entropy Ed25519 key pair in PKCS#8 PEM format:

```bash
# Generate private key
openssl genpkey -algorithm ed25519 -out context_signing_private_k2.pem

# Extract corresponding SPKI public key
openssl pkey -in context_signing_private_k2.pem -pubout -out context_signing_public_k2.pem
```

Assign a distinct `kid` based on date: e.g. `k20261101_01`.

### Phase B: Register Public Key in Verification Targets

1. **Deploy Public Key to `sineva-ai`**:
   Update `sineva-ai` configuration (e.g. `CONTEXT_PUBLIC_KEYS={"k20261101_01": "<public_key_pem>", "k20261021_01": "<old_public_key_pem>"}`) and perform a rolling deployment.
   Verify that `sineva-ai` logs successful loading of both public keys.

2. **Register Key in `platform.signing_keys` (Optional / Internal Registry)**:
   Insert the new public key with status `next`:
   ```sql
   INSERT INTO platform.signing_keys (kid, alg, public_key, status, purpose, valid_from, valid_until)
   VALUES (
     'k20261101_01',
     'EdDSA',
     '<public_key_pem>',
     'next',
     'context',
     NOW(),
     NOW() + INTERVAL '90 days'
   );
   ```

### Phase C: Switch Active Signing Key on `sineva-platform`

1. Set `INTERNAL_CONTEXT_SIGNING_KEY` to the contents of `context_signing_private_k2.pem`.
2. Set `INTERNAL_CONTEXT_KID=k20261101_01`.
3. Deploy / restart `sineva-platform`.
4. Update `signing_keys` table to mark `k20261101_01` as `active` and previous key as `retired`:
   ```sql
   UPDATE platform.signing_keys SET status = 'retired' WHERE status = 'active' AND kid != 'k20261101_01';
   UPDATE platform.signing_keys SET status = 'active' WHERE kid = 'k20261101_01';
   ```
5. Emit `signing_key.rotated` audit event.

### Phase D: Verify Minting and Verification

1. Inspect incoming requests from `sineva-platform` to `sineva-ai`.
2. Verify token header contains `"kid": "k20261101_01"`.
3. Confirm that `sineva-ai` verifies incoming `X-Sineva-Context` tokens with 200 responses.

### Phase E: Decommission Old Public Key

Wait at least 15 minutes (well beyond the 60-second token expiration window):
1. Remove the old public key from `sineva-ai` configuration and redeploy.
2. Securely shred or delete the local temporary copy of the old private key file.

---

## 3. Emergency Key Revocation

If an `INTERNAL_CONTEXT_SIGNING_KEY` private key is suspected of compromise:
1. Immediately execute Phase A & B to deploy a clean key pair.
2. Immediately execute Phase C to switch active signing on `sineva-platform`.
3. In `sineva-ai`, remove the compromised `kid` immediately from the trusted public key map (all tokens signed with the compromised key will fail verification with 401 `context_invalid`).
4. In `platform.signing_keys`, set compromised key status to `compromised` or delete it.
5. Review platform and engine audit logs for any unauthorized turns.
