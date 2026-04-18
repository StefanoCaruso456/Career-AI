# document-verifier

HTTP service that takes a candidate's employment claim plus the supporting PDF and returns a verdict covering three independent signals:

1. **Tampering** — has the document been edited since it was signed? Structural anomaly detector today; real PKCS#7 validation is a future package.
2. **Authenticity** — did the document actually come from the claimed employer? Interprets the DocuSign markers and CoC data surfaced by `pdf-extractor`.
3. **Content match** — does the document text agree with the candidate's claim? Swappable `ContentExtractor` interface (heuristic today, Claude later).

**This service no longer does PDF parsing itself** — that moved to [`pdf-extractor`](../pdf-extractor). document-verifier is now pure business logic: it receives a PDF from its caller, forwards it to pdf-extractor, and runs the verifiers over the structured `ExtractionResult` that comes back.

## Dependency chain

```
Career-AI ──▶ api-gateway ──▶ document-verifier ──▶ pdf-extractor
                                       │
                                       └── uses ContentExtractor (heuristic | claude)
```

## What the verifiers actually do

- **`tampering.ts`** — inspects the extraction result's signature dict count, DocuSign markers, and XMP. Flags structural anomalies (page text claims DocuSign but the PDF has no signature dict / no AcroForm ENVELOPEID_ field / no PPKMS filter / no XMP DocuSign namespace — consistent with re-save attacks). Does NOT perform cryptographic validation yet.
- **`authenticity.ts`** — decides whether the document is `docusign` (CoC or envelope-stamp-only), `pkcs7-embedded` (non-DocuSign signed PDF), or `unsigned`. For CoC documents, parses the "Envelope Originator" section (not "Sender") to extract sender email and domain, then compares against the claimed employer.
- **`content.ts`** — current heuristic extractor does case-insensitive substring + fuzzy token matching for employer, role, and dates. The `ContentExtractor` interface is designed for a drop-in Claude implementation later.
- **`verdict.ts`** — aggregates the three signals into VERIFIED / PARTIAL / FAILED plus a confidence tier. Ceiling is `REVIEWED` (see the block comment in verdict.ts — PKCS#7 + CoC text matching does NOT prove sender identity for standard DocuSign envelopes).

## API

### `POST /v1/verify`

Verify an uploaded PDF against a claim.

**Request** (multipart form):

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | PDF file | yes | The offer letter or employment document |
| `claim` | JSON string | yes | `{ "employer": "Apple Inc.", "role": "Senior SWE", "startDate": "2020-01-15", "endDate": "2024-03-30" }` |

**Response** (JSON):

```json
{
  "verdict": "VERIFIED",
  "confidenceTier": "SOURCE_CONFIRMED",
  "signals": {
    "tampering": {
      "detected": false,
      "method": "docusign-cert-parse",
      "details": { "envelopeHashMatch": true }
    },
    "authenticity": {
      "source": "docusign",
      "envelopeId": "a1b2c3d4-...",
      "senderEmail": "hr@apple.com",
      "senderDomain": "apple.com",
      "signerDomains": ["apple.com"],
      "completedAt": "2020-01-10T09:42:00Z",
      "matchesClaim": true
    },
    "content": {
      "employer": "Apple Inc.",
      "role": "Senior Software Engineer",
      "startDate": "2020-01-15",
      "endDate": null,
      "extractor": "heuristic",
      "matchesClaim": true
    }
  },
  "provenance": {
    "fileHash": "sha256:3a8f92b1c1d4e5f6...",
    "verifiedAt": "2026-04-13T14:22:00Z",
    "verifier": "document-verifier@0.1.0"
  }
}
```

**Verdict levels**:

| Verdict | Meaning |
|---|---|
| `VERIFIED` | All three signals positive (no tampering detected, authentic source, content matches claim) |
| `PARTIAL` | Some signals positive but not all (e.g. content matches but source is unsigned) |
| `FAILED` | Tampering detected OR employer mismatch OR content contradicts claim |

**Confidence tier** maps to the Career Protocol confidence tier enum. **This service cannot reach `SOURCE_CONFIRMED` on its own** — see the tier ceiling note below.

| Conditions | Tier |
|---|---|
| DocuSign CoC sender domain matches employer + content matches | `REVIEWED` |
| Valid embedded PKCS#7 signature + signer domain matches employer + content matches | `REVIEWED` |
| Unsigned PDF + content matches | `EVIDENCE_SUBMITTED` |
| Any signal contradicts the claim | `SELF_REPORTED` (effectively unverified) |

### Why no SOURCE_CONFIRMED from this service

When a company like Apple sends a DocuSigned offer letter, the PKCS#7 signature in the PDF is produced by **DocuSign's platform signing key**, not by a cert belonging to Apple. The signer cert's Subject literally reads "DocuSign Inc." Validating the PKCS#7 signature proves:

1. The PDF has not been modified since DocuSign sealed it
2. DocuSign (the company) issued it

It does **not** prove the envelope was sent by Apple. The sender identity lives only in the Certificate of Completion text, which is application-level metadata — typically appended to the PDF via an incremental update **outside** the ByteRange covered by the signature. That means the CoC text is not cryptographically protected and could be edited without breaking signature validation.

**The only way for an upstream caller (e.g., api-gateway) to reach `SOURCE_CONFIRMED`** is to combine this service's output with out-of-band verification:

- **Email DKIM/DMARC validation** on the original offer email — proves origin from the employer's mail infrastructure
- **Employer verification registry cross-check** — combines a domain ownership proof with a matching sender domain
- **Employer Agent attestation** via the A2A protocol (Phase T5) — the employer's own agent confirms they sent the envelope
- **Detection of DocuSign Standards-Based Signatures (SBS)** — an uncommon premium mode where the signing cert IS issued to the actual signer, in which case PKCS#7 does prove origin

Until one of those signals exists, the honest ceiling is `REVIEWED`.

### `GET /v1/health`

Health check. Returns `{ "status": "ok", "version": "0.1.0" }`.

## Running

```bash
cd services/document-verifier
npm install
cp .env.example .env
npm run dev
```

Service starts on `http://localhost:8787`.

## Testing with a sample PDF

Generate a synthetic offer letter for local testing:

```bash
npm run generate:fixture
```

This creates `test/fixtures/sample-offer-letter.pdf` — a text-only PDF that exercises the content extraction path (but not the signature/DocuSign path).

Then verify it:

```bash
curl -X POST http://localhost:8787/v1/verify \
  -F "file=@test/fixtures/sample-offer-letter.pdf" \
  -F 'claim={"employer":"Acme Corp","role":"Senior Engineer","startDate":"2022-03-01"}'
```

For real DocuSign-signed PDFs, drop them into `test/fixtures/` and hit the same endpoint.

## Integration into Career-AI

Career-AI's existing artifact upload flow calls this service's `/v1/verify` endpoint. Today the result is displayed in the candidate dashboard as a verification summary. When `issuer-service` is wired up (Phase T2), the same verdict will trigger VC issuance.

## Design notes

### Swappable content extractor

The content extraction step is behind an interface:

```ts
export interface ContentExtractor {
  readonly name: string;
  extractEmployment(text: string, claim: EmploymentClaim): Promise<ContentMatchSignal>;
}
```

Current implementations:

- `HeuristicContentExtractor` — regex and substring matching. Fast, offline, no API cost, decent for structured offer letters. Current default.
- *(Future)* `ClaudeContentExtractor` — calls the Claude API with a prompt that asks for structured extraction. Better for unstructured or oddly-formatted documents.

Switch via `CONTENT_EXTRACTOR` env var.

### Why stubbed crypto

Real PKCS#7 PDF signature validation requires:

1. Locating the signature dictionary in the PDF cross-reference table
2. Extracting the ByteRange and signed bytes
3. Decoding the CMS/PKCS#7 blob
4. Building the certificate chain
5. Verifying the chain against a trusted root store
6. Checking OCSP/CRL for revocation

This is a week of work to get right and libraries like `node-forge` make it moderately easier but still non-trivial. For the demo, parsing the DocuSign Certificate of Completion text gives us enough signal to prove the pipeline works. The cryptographic layer is isolated in `src/pdf/signatures.ts` with a clear TODO.

### Verify-and-forget

The service never persists uploads. Every request is stateless. The raw PDF exists in memory only for the duration of the request. If we later add any persistence (for async verification), it MUST honor the verify-and-forget rule from [protocol/spec/credentials.md](../../protocol/spec/credentials.md): the artifact hash persists, the raw bytes do not.
