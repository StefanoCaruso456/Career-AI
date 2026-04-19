-- Adds a `role` column to career_builder_evidence so offer-letter evidence
-- can record the claimed role (Software Engineer, Product Manager, etc.).
-- The column is nullable at the SQL level (DEFAULT '') so it applies cleanly
-- to evidence types that don't need a role. Required-ness is enforced in
-- the domain layer: validateEvidenceSubmission rejects an empty role only
-- when templateId === 'offer-letters'.

ALTER TABLE career_builder_evidence
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT '';
