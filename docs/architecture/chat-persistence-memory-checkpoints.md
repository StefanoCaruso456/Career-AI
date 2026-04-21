# Chat Persistence, Memory, And Checkpoints

Chat has two storage modes in the current codebase.

## Storage Modes

### Local mode

Used when `DATABASE_URL` is absent.

- workspace manifest: `.artifacts/chat/state.json`
- attachment bytes: `.artifacts/chat/files/*`
- projects, conversations, messages, and attachment metadata live in the local manifest

### Persistent mode

Used when `DATABASE_URL` is configured.

Durable tables include:

- `chat_projects`
- `chat_conversations`
- `chat_messages`
- `chat_attachments`
- `chat_memory_records`
- `chat_checkpoints`
- `chat_audit_events`
- `chat_memory_jobs`

Even in persistent mode, attachment bytes are still written through the local chat attachment storage adapter under `.artifacts/chat/files`.

## Write Flow

For a normal chat turn:

1. the route resolves the chat actor
2. the user message is persisted
3. the assistant reply is persisted
4. `runPostAssistantPersistence` runs inline
5. memory records and `chat_memory_jobs` are updated in DB-backed mode
6. auto-checkpointing can fire based on project message count

There is no separate memory worker service in this repo. `chat_memory_jobs` is a durable queue record plus status history, but execution still happens inline in the request flow.

## Routes

- `GET /api/chat/state`
- `POST /api/chat`
- `POST /api/chat/projects`
- `PATCH /api/chat/projects/[projectId]`
- `DELETE /api/chat/projects/[projectId]`
- `PATCH /api/chat/conversations/[conversationId]`
- `DELETE /api/chat/conversations/[conversationId]`
- `POST /api/chat/projects/[projectId]/checkpoints`
- `POST /api/chat/checkpoints/[checkpointId]/restore`
- `GET /api/chat/projects/[projectId]/activity`

## Checkpoints And Activity

- Manual checkpoint creation and restore are only implemented for DB-backed chat.
- Project activity reads recent chat audit events, checkpoints, and memory records from Postgres.
- Local-mode chat returns `501` for checkpoint, restore, and activity features.

## Audit And Dedupe

- Chat mutations generate chat-audit events in persistent mode.
- Client request IDs are used to avoid duplicate writes for retried sends.

## Current Limits

- Attachment bytes are not stored in Postgres or object storage by the chat system today.
- Memory extraction is synchronous with the request path.
- Restore, activity history, and checkpoints are unavailable without a database.
