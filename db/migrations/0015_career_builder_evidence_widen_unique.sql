-- Widens the career_builder_evidence uniqueness key from
-- (career_identity_id, template_id) to
-- (career_identity_id, template_id, source_or_issuer, role).
--
-- The original constraint collapsed every "offer-letters" evidence row for
-- a single user into one record — a second offer letter for a different
-- employer/role UPSERTed and overwrote the first, so the older badge
-- disappeared from the Career ID. With the widened key each
-- (employer, role) combination gets its own row, producing its own badge,
-- while re-uploading the same (employer, role) still collapses into a
-- single row (the "new version of the same badge" case).
--
-- For templates with no natural identity fields (drivers-license,
-- endorsements without a named endorser), source_or_issuer and role
-- default to the empty string, so the compound key still uniquely
-- collapses a single such row per user — identical behavior to before
-- the widening for those templates.

ALTER TABLE career_builder_evidence
  DROP CONSTRAINT IF EXISTS career_builder_evidence_career_identity_id_template_id_key;

ALTER TABLE career_builder_evidence
  ADD CONSTRAINT career_builder_evidence_identity_template_subject_key
  UNIQUE (career_identity_id, template_id, source_or_issuer, role);
