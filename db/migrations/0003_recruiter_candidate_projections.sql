CREATE TABLE IF NOT EXISTS recruiter_candidate_projections (
  career_identity_id text PRIMARY KEY REFERENCES career_identities(id) ON DELETE CASCADE,
  talent_agent_id text NOT NULL,
  role_type text,
  recruiter_visibility text NOT NULL DEFAULT 'searchable'
    CHECK (recruiter_visibility IN ('searchable', 'limited', 'private')),
  is_searchable boolean NOT NULL DEFAULT false,
  display_name text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  target_role text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  profile_summary text NOT NULL DEFAULT '',
  current_employer text,
  prior_employers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_text text NOT NULL DEFAULT '',
  search_keywords_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience_highlights_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_count integer NOT NULL DEFAULT 0,
  verified_experience_count integer NOT NULL DEFAULT 0,
  credibility_score double precision NOT NULL DEFAULT 0,
  verification_signal text NOT NULL DEFAULT 'Early profile',
  share_profile_id text,
  public_share_token text,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiter_candidate_projections_searchable_idx
  ON recruiter_candidate_projections (is_searchable, updated_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_candidate_projections_career_id_idx
  ON recruiter_candidate_projections (talent_agent_id);

CREATE INDEX IF NOT EXISTS recruiter_candidate_projections_visibility_idx
  ON recruiter_candidate_projections (recruiter_visibility, updated_at DESC);
