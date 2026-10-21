-- CreateTable
CREATE TABLE IF NOT EXISTS platform.signing_keys (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    kid VARCHAR(64) NOT NULL,
    alg VARCHAR(32) NOT NULL DEFAULT 'EdDSA',
    public_key TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    purpose VARCHAR(32) NOT NULL DEFAULT 'context',
    valid_from TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMPTZ(6) NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT signing_keys_pkey PRIMARY KEY (id)
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS signing_keys_kid_key ON platform.signing_keys(kid);

-- CreateIndex
CREATE INDEX IF NOT EXISTS signing_keys_purpose_status_idx ON platform.signing_keys(purpose, status);
