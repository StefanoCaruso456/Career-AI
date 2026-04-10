CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON organization_memberships (user_id, organization_id);

CREATE TABLE IF NOT EXISTS chat_projects (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  owner_id text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  latest_summary text NOT NULL DEFAULT '',
  last_message_at timestamptz,
  last_checkpoint_at timestamptz,
  last_saved_at timestamptz NOT NULL DEFAULT NOW(),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS chat_projects_owner_idx
  ON chat_projects (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_projects_org_idx
  ON chat_projects (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES chat_projects(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  title text NOT NULL,
  label_source text NOT NULL DEFAULT 'auto'
    CHECK (label_source IN ('auto', 'manual')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS chat_conversations_project_idx
  ON chat_conversations (project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_conversations_owner_idx
  ON chat_conversations (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  role text NOT NULL
    CHECK (role IN ('assistant', 'user')),
  content text NOT NULL DEFAULT '',
  structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_request_id text,
  reply_to_message_id text REFERENCES chat_messages(id) ON DELETE SET NULL,
  error boolean NOT NULL DEFAULT false,
  sequence_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_owner_request_idx
  ON chat_messages (owner_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_conversation_sequence_idx
  ON chat_messages (conversation_id, sequence_number);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
  ON chat_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS chat_messages_reply_to_idx
  ON chat_messages (reply_to_message_id);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  project_id text REFERENCES chat_projects(id) ON DELETE CASCADE,
  conversation_id text REFERENCES chat_conversations(id) ON DELETE CASCADE,
  message_id text REFERENCES chat_messages(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  extension text NOT NULL,
  preview_kind text NOT NULL
    CHECK (preview_kind IN ('document', 'image', 'pdf', 'presentation', 'spreadsheet', 'text')),
  status text NOT NULL
    CHECK (status IN ('attached', 'uploaded')),
  scan_status text NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('not_scanned', 'pending')),
  storage_key text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_attachments_project_idx
  ON chat_attachments (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_attachments_conversation_idx
  ON chat_attachments (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON chat_attachments (message_id);

CREATE TABLE IF NOT EXISTS chat_memory_records (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  project_id text REFERENCES chat_projects(id) ON DELETE CASCADE,
  conversation_id text REFERENCES chat_conversations(id) ON DELETE CASCADE,
  scope text NOT NULL
    CHECK (scope IN ('user', 'project', 'thread')),
  scope_id text NOT NULL,
  memory_type text NOT NULL
    CHECK (memory_type IN ('preference', 'fact', 'goal', 'constraint', 'summary', 'task')),
  title text NOT NULL,
  content text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_message_ids text[] NOT NULL DEFAULT '{}'::text[],
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_memory_records_owner_scope_idx
  ON chat_memory_records (owner_id, scope, scope_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_memory_records_project_idx
  ON chat_memory_records (project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_checkpoints (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  project_id text NOT NULL REFERENCES chat_projects(id) ON DELETE CASCADE,
  conversation_id text REFERENCES chat_conversations(id) ON DELETE SET NULL,
  checkpoint_type text NOT NULL
    CHECK (checkpoint_type IN ('auto', 'manual', 'milestone', 'pre_tool', 'post_tool')),
  title text NOT NULL,
  summary text NOT NULL,
  serialized_state_json jsonb NOT NULL,
  created_by text NOT NULL,
  restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_checkpoints_project_idx
  ON chat_checkpoints (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_audit_events (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  owner_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  event_type text NOT NULL,
  actor_id text NOT NULL,
  summary text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_audit_events_owner_idx
  ON chat_audit_events (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_audit_events_entity_idx
  ON chat_audit_events (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_memory_jobs (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  project_id text NOT NULL REFERENCES chat_projects(id) ON DELETE CASCADE,
  conversation_id text REFERENCES chat_conversations(id) ON DELETE SET NULL,
  trigger_message_id text REFERENCES chat_messages(id) ON DELETE SET NULL,
  status text NOT NULL
    CHECK (status IN ('pending', 'completed', 'failed', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_message text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  last_attempt_at timestamptz
);

CREATE INDEX IF NOT EXISTS chat_memory_jobs_project_idx
  ON chat_memory_jobs (project_id, status, updated_at DESC);
