# Chat Attachments

Chat attachments are implemented and persisted, but the persistence split is important.

## What Is Stored

- Attachment metadata is stored with the chat workspace.
- In local mode that metadata lives in `.artifacts/chat/state.json`.
- In DB-backed mode it lives in `chat_attachments`.
- Attachment bytes are currently written through `localChatAttachmentStorage` to `.artifacts/chat/files/*` in both modes.

## Ownership And Access

- Signed-in users use their authenticated owner ID.
- Anonymous homepage users get a signed HTTP-only owner cookie.
- Attachment reads and deletes check owner identity before serving or mutating data.
- Sent attachments cannot be deleted from the composer.

## Validation And Limits

- MIME type and extension validation use the shared chat attachment candidate validator.
- Upload rate limiting is enforced per owner in memory.
- The route exposes file metadata, but the assistant is explicitly told not to claim file contents were parsed unless the user provided content separately.

## Routes

- `POST /api/chat/attachments`
- `GET /api/chat/attachments/[attachmentId]`
- `DELETE /api/chat/attachments/[attachmentId]`

Those routes work alongside the rest of the chat workspace APIs.

## Current Limits

- The chat attachment system does not run OCR, extraction, malware scanning, or thumbnail generation.
- `scanStatus` and related fields are placeholders for future pipeline work, not evidence that a scan pipeline exists today.
- Persistent chat moves metadata into Postgres, but not the binary bytes.
