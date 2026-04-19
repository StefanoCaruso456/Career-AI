/**
 * Idempotent migration runner.
 *
 * For the demo we use a simple raw-SQL approach instead of drizzle-kit's
 * generated migrations — the schema is small enough that this is clearer
 * and faster to iterate on. When we add more tables, switch to drizzle-kit
 * generated migrations (`npm run db:generate`) and use drizzle's migrator.
 */

import postgres from "postgres";

const DDL = `
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_did TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_owner_did_idx ON claims(owner_did);
CREATE INDEX IF NOT EXISTS claims_type_idx ON claims(claim_type);

CREATE TABLE IF NOT EXISTS verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  verifier TEXT NOT NULL,
  verdict TEXT NOT NULL,
  confidence_tier TEXT NOT NULL,
  signals JSONB NOT NULL,
  provenance JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifications_claim_id_idx ON verifications(claim_id);

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  subject_did TEXT NOT NULL,
  issuer_did TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS badges_subject_did_idx ON badges(subject_did);
CREATE INDEX IF NOT EXISTS badges_claim_id_idx ON badges(claim_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_did TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_correlation_idx ON audit_events(correlation_id);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at);

-- Back-compat: earlier migrations created status_code / duration_ms as TEXT.
-- Coerce in-place if that is still the case. Idempotent — once the columns
-- are integer the DO-block is a no-op.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'status_code' AND data_type = 'text'
  ) THEN
    ALTER TABLE audit_events ALTER COLUMN status_code TYPE integer USING status_code::integer;
    ALTER TABLE audit_events ALTER COLUMN duration_ms TYPE integer USING duration_ms::integer;
  END IF;
END $$;
`;

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgres://career_ledger:career_ledger_dev@localhost:5433/career_ledger";

  console.log(`[migrate] connecting to ${connectionString.replace(/:[^:@]+@/, ":***@")}`);
  const client = postgres(connectionString, { max: 1 });

  try {
    await client.unsafe(DDL);
    console.log("[migrate] schema applied");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
