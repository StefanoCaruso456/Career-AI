# pdf-extractor

HTTP service that takes a PDF and returns a structured extraction blob — text, /Info metadata, XMP, AcroForm fields, signature dictionary summaries, and DocuSign markers. **Business-logic-free on purpose.** Reusable by `document-verifier` today and by future services (`contract-verifier`, `resume-parser`, `background-check`).

## API

### `POST /v1/extract`

**Request** (multipart/form-data):
- `file` — PDF upload

**Response**: `ExtractionResult` — see [`src/types.ts`](./src/types.ts).

```json
{
  "service": "pdf-extractor@0.1.0",
  "fileHash": "sha256:...",
  "fileSize": 197222,
  "text": { "content": "...", "pageCount": 2, "length": 2768 },
  "info": { "title": "...", "author": "...", "producer": "pdf-lib ...", ... },
  "xmp": { "producer": "Docusign DMv10", "hasDocuSignNamespace": true, "rawSnippet": "..." },
  "acroForm": { "fieldCount": 1, "fields": [...], "envelopeIdFieldName": "ENVELOPEID_843A2C..." },
  "signatures": [
    { "filter": "/Adobe.PPKMS", "subFilter": "/adbe.pkcs7.detached", "reason": "...", "byteRangePresent": true }
  ],
  "docusignMarkers": {
    "variant": "envelope-stamp-only",
    "envelopeId": "843A2C46-7580-8A85-8141-E4A1074509BE",
    "envelopeIdSource": "acroform",
    "hasCocHeading": false,
    "hasEnvelopeText": true,
    "hasXmpDocusignNamespace": true,
    "hasAdobePPKMSFilter": true
  },
  "errors": []
}
```

### `GET /v1/health`

Unauthenticated health probe. Returns `{status, service, version}`.

## Design rules

- **Business logic free**. The extractor reports what it sees, never what it means. Interpretation lives in the consumer.
- **Best-effort**. Each extractor (text, metadata, signatures, DocuSign markers) runs independently. Failures in one don't prevent others from reporting. Non-fatal errors collect in the `errors` array.
- **Stable output shape**. Fields are always present — absent values are `undefined`, never omitted. Callers can safely destructure.
- **No persistence**. Stateless. Every request is ephemeral. If we ever add caching, it must honor verify-and-forget.
- **Envelope ID priority**: AcroForm `ENVELOPEID_<hex>` field name > per-page watermark text > XMP `<EnvelopeID>` tag. Most reliable source wins.

## Running locally

```bash
cd services/pdf-extractor
npm install
cp .env.example .env
npm run dev
```

Service listens on `http://localhost:8788`.

## Smoke test

```bash
curl -sS -X POST http://localhost:8788/v1/extract \
  -F "file=@../document-verifier/test/fixtures/signed.pdf" | jq '.docusignMarkers, .signatures[0], .acroForm.envelopeIdFieldName'
```

## Consumers

- `services/document-verifier` — calls `/v1/extract` as the first step of every verify request
- *(future)* `services/contract-verifier` — will use the same endpoint
- *(future)* `services/resume-parser` — will use the same endpoint

## Not in scope for this service

- Business interpretation (does this look like an offer letter from Apple?) — that's `document-verifier`
- Cryptographic signature verification (PKCS#7 / PAdES validation) — that's `packages/private/pdf-signature-verifier`
- OCR for scanned / image-only PDFs — future
- Non-PDF input types — future
