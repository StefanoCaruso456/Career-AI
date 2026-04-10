# Chat Attachment Architecture

## Overview

The homepage chat now uses a reusable attachment pipeline instead of local-only composer state.

- The prompt composer uploads files immediately through `/api/chat/attachments`.
- Attachment binaries are stored through a storage adapter.
- Attachment metadata, projects, conversations, and messages are persisted in a versioned manifest.
- Sending a message attaches uploaded file IDs to the persisted user message.
- Reloading the chat reads everything back from `/api/chat/state`, so attachments render again from server data instead of temporary client state.

## Storage Model

This repository does not currently include a database or managed object storage provider, so the implementation uses a production-shaped abstraction with a local disk adapter:

- Manifest path: `.artifacts/chat/state.json`
- File storage root: `.artifacts/chat/files/`
- Storage adapter: `packages/chat-domain/src/storage.ts`

The manifest is versioned and migrated on read. That gives us a clean handoff point if the repo later adds Postgres, Blob storage, or signed object URLs.

## Persisted Records

`packages/chat-domain/src/schema.ts` stores four record types:

- `projects`
- `conversations`
- `messages`
- `attachments`

Attachments keep:

- owner identity
- optional conversation ID
- optional message ID
- original filename
- MIME type
- extension
- size
- preview kind
- storage key
- status
- scan placeholder state
- timestamps

## Security Model

- Uploads and reads are owned by a resolved chat actor.
- Signed-in users use their existing auth identity.
- Anonymous homepage users receive a signed, HTTP-only chat-owner cookie so files are still protected and scoped.
- Attachment retrieval always checks owner identity before reading the stored file.
- Raw storage keys never leave the server.
- Upload validation enforces the MIME and extension allowlist, file size limit, and a rate limit window.

## Frontend Modules

- `components/use-chat-attachment-drafts.ts`: upload lifecycle, retries, optimistic removal, object URL cleanup
- `components/file-upload-dropzone.tsx`: drag-and-drop shell
- `components/attachment-button.tsx`: reusable attach trigger
- `components/prompt-composer-attachments.tsx`: pre-send attachment preview stack
- `components/chat-message-attachments.tsx`: read-only message attachment renderer
- `components/attachment-chip.tsx` and `components/attachment-thumbnail.tsx`: shared attachment card UI

## API Surface

- `GET /api/chat/state`
- `POST /api/chat`
- `POST /api/chat/attachments`
- `GET /api/chat/attachments/[attachmentId]`
- `DELETE /api/chat/attachments/[attachmentId]`
- `POST /api/chat/projects`
- `PATCH /api/chat/projects/[projectId]`
- `DELETE /api/chat/projects/[projectId]`
- `PATCH /api/chat/conversations/[conversationId]`
- `DELETE /api/chat/conversations/[conversationId]`

## Follow-Up Upgrades

- Swap the local storage adapter for managed object storage in production.
- Move the manifest persistence into a relational database once the repo adds one.
- Add malware scanning and document text extraction hooks behind the stored `scanStatus`.
- Add server-generated thumbnails for PDFs and office files.
