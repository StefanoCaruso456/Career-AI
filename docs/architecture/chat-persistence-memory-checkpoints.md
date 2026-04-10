# Chat Persistence, Memory, and Checkpoints

## Overview

Career AI now supports a layered persistence model for chat workspaces:

1. Current-state relational tables for projects, chats, messages, attachments, memory records, and checkpoints.
2. Append-only audit events for important mutations.
3. Memory job tracking with dead-letter status for failed extraction work.

The frontend is no longer expected to be the source of truth for projects or chat threads. It renders persisted records returned by `/api/chat/*`.

## Data Model

The platform migration in `db/migrations/0003_chat_persistence_platform.sql` adds:

- `organizations`
- `organization_memberships`
- `chat_projects`
- `chat_conversations`
- `chat_messages`
- `chat_attachments`
- `chat_memory_records`
- `chat_checkpoints`
- `chat_audit_events`
- `chat_memory_jobs`

## Write Flow

For a chat send:

1. The client sends a `clientRequestId`.
2. The API persists the user message before the assistant runs.
3. The assistant reply is saved as a linked message.
4. Memory extraction runs and writes durable summaries/goals/preferences/tasks.
5. The project auto-checkpoints after completed message intervals.
6. Audit events are recorded for the full lifecycle.

If the same `clientRequestId` is retried, the backend can reuse the saved turn instead of creating a duplicate user message.

## Checkpoints

Checkpoint routes:

- `POST /api/chat/projects/[projectId]/checkpoints`
- `POST /api/chat/checkpoints/[checkpointId]/restore`

Checkpoint payloads store project, conversation, message, attachment, and memory state so the workspace can be reconstructed after restore.

## Activity History

Project activity is exposed through:

- `GET /api/chat/projects/[projectId]/activity`

The response includes:

- recent audit events
- recent checkpoints
- durable memory records

## Rollout / Migration Plan

1. Run `npm run db:migrate` in each environment with `DATABASE_URL` configured.
2. Verify the new chat tables exist and that chat routes return workspace persistence metadata.
3. Roll the application with database-backed chat enabled.
4. Validate that newly created projects remain visible after refresh and that chats remain attached to the correct project.
5. If legacy file-backed chat state exists in `.artifacts/chat`, treat it as read-only historical storage. New writes should use Postgres as the canonical source of truth.

## Current Fallback

If `DATABASE_URL` is not configured, the app still falls back to the existing file-backed chat store. Checkpoints, activity history, and restore require the database-backed path.
