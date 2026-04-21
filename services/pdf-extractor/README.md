# pdf-extractor

`pdf-extractor` is a standalone Hono service that parses uploaded PDFs and returns extracted structure.

## Current Surface

- `GET /v1/health`
- `POST /v1/extract`

`POST /v1/extract` accepts multipart form data with a single `file` field and returns:

- text extraction
- PDF metadata
- XMP metadata
- AcroForm details
- signature-dictionary summaries
- DocuSign marker detection
- extraction errors

## Current Use

- `services/api-gateway` calls this service over HTTP during claim verification.

## Local Run

```bash
npm --workspace services/pdf-extractor install
npm --workspace services/pdf-extractor run dev
```

The service listens on port `8788` by default.
