CREATE TABLE IF NOT EXISTS agent_messages (
  message_id text PRIMARY KEY,
  request_id text NOT NULL UNIQUE,
  protocol_version text NOT NULL,
  sender_agent_id text NOT NULL,
  receiver_agent_id text NOT NULL,
  conversation_id text,
  thread_id text,
  reply_to text,
  parent_run_id text,
  trace_id text NOT NULL,
  task_type text NOT NULL,
  operation text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  auth_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  sent_at timestamptz NOT NULL,
  deadline_at timestamptz,
  status text NOT NULL
    CHECK (status IN ('accepted', 'running', 'awaiting_input', 'completed', 'failed', 'partial', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_messages_sender_receiver_idx
  ON agent_messages (sender_agent_id, receiver_agent_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS agent_messages_trace_idx
  ON agent_messages (trace_id);

CREATE INDEX IF NOT EXISTS agent_messages_parent_run_idx
  ON agent_messages (parent_run_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES agent_messages(message_id) ON DELETE CASCADE,
  request_id text NOT NULL,
  parent_run_id text REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  trace_id text NOT NULL,
  sender_agent_id text NOT NULL,
  receiver_agent_id text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('accepted', 'running', 'awaiting_input', 'completed', 'failed', 'partial', 'cancelled')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_runs_request_idx
  ON agent_runs (request_id, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_parent_idx
  ON agent_runs (parent_run_id);

CREATE INDEX IF NOT EXISTS agent_runs_trace_idx
  ON agent_runs (trace_id);

CREATE TABLE IF NOT EXISTS agent_handoffs (
  handoff_id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES agent_messages(message_id) ON DELETE CASCADE,
  request_id text NOT NULL,
  parent_run_id text REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  child_run_id text REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  sender_agent_id text NOT NULL,
  receiver_agent_id text NOT NULL,
  source_endpoint text,
  target_endpoint text,
  handoff_type text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('accepted', 'running', 'awaiting_input', 'completed', 'failed', 'partial', 'cancelled')),
  trace_id text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_handoffs_parent_run_idx
  ON agent_handoffs (parent_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_handoffs_child_run_idx
  ON agent_handoffs (child_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_handoffs_request_idx
  ON agent_handoffs (request_id);

CREATE TABLE IF NOT EXISTS agent_task_events (
  event_id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES agent_messages(message_id) ON DELETE CASCADE,
  request_id text NOT NULL,
  run_id text REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  parent_run_id text,
  sender_agent_id text NOT NULL,
  receiver_agent_id text NOT NULL,
  event_name text NOT NULL,
  span_name text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('accepted', 'running', 'awaiting_input', 'completed', 'failed', 'partial', 'cancelled')),
  previous_status text
    CHECK (previous_status IS NULL OR previous_status IN ('accepted', 'running', 'awaiting_input', 'completed', 'failed', 'partial', 'cancelled')),
  trace_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_task_events_request_idx
  ON agent_task_events (request_id, created_at ASC);

CREATE INDEX IF NOT EXISTS agent_task_events_run_idx
  ON agent_task_events (run_id, created_at ASC);

CREATE INDEX IF NOT EXISTS agent_task_events_trace_idx
  ON agent_task_events (trace_id, created_at ASC);
