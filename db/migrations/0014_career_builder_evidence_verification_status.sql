-- Persists the verifier's verdict on each piece of career-builder evidence.
-- Today only offer-letter uploads get a verdict (from api-gateway's document
-- verifier), but the column is generic in case other document types flow
-- through a verifier later.
--
-- NULL  = evidence has not been run through a verifier (or verification
--         failed to run, e.g. api-gateway unreachable).
-- Otherwise one of 'VERIFIED' | 'PARTIAL' | 'FAILED' — matching the verdict
-- shape the api-gateway orchestrator returns.
--
-- Badge derivation in career-id-domain reads this column: a VERIFIED row on
-- an offer-letter evidence record yields an "Offer letter verified" badge,
-- matching the existing "Government ID verified" badge pattern Stefano shipped.

ALTER TABLE career_builder_evidence
  ADD COLUMN IF NOT EXISTS verification_status text;
