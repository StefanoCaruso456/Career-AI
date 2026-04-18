import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import { extractDocument } from "./clients/pdf-extractor.js";
import { detectTampering } from "./verifiers/tampering.js";
import { checkAuthenticity } from "./verifiers/authenticity.js";
import { buildContentExtractor } from "./verifiers/content.js";
import { computeVerdict } from "./verifiers/verdict.js";
import type { EmploymentClaim, VerifyResponse } from "./types.js";

const VERSION = "0.1.0";
const SERVICE_NAME = `document-verifier@${VERSION}`;

const claimSchema = z.object({
  employer: z.string().min(1),
  role: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const app = new Hono();

const contentExtractor = buildContentExtractor();

app.get("/v1/health", (c) =>
  c.json({ status: "ok", version: VERSION, extractor: contentExtractor.name }),
);

app.post("/v1/verify", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "INVALID_REQUEST", message: "Expected multipart/form-data body." }, 400);
  }

  const file = form.get("file");
  const certificateFile = form.get("certificate"); // optional separate CoC
  const claimRaw = form.get("claim");

  if (!(file instanceof File)) {
    return c.json({ error: "INVALID_REQUEST", message: "Missing 'file' field (expected a PDF upload)." }, 400);
  }
  if (typeof claimRaw !== "string") {
    return c.json({ error: "INVALID_REQUEST", message: "Missing 'claim' field (expected a JSON string)." }, 400);
  }

  let claim: EmploymentClaim;
  try {
    const parsed = JSON.parse(claimRaw);
    claim = claimSchema.parse(parsed);
  } catch (err) {
    return c.json({ error: "VALIDATION_FAILED", message: "Invalid claim JSON.", details: String(err) }, 400);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    return c.json({ error: "INVALID_REQUEST", message: "Uploaded file is empty." }, 400);
  }

  let docExtraction;
  try {
    docExtraction = await extractDocument(buffer, file.name || "upload.pdf");
  } catch (err) {
    return c.json(
      {
        error: "EXTRACTION_UNAVAILABLE",
        message: `pdf-extractor call failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      502,
    );
  }

  // Optional second file: a separate Certificate of Completion PDF.
  // Used when the user downloaded the doc and CoC as separate files from
  // DocuSign (variant C). We extract the CoC the same way and cross-reference
  // envelope IDs.
  let cocExtraction: Awaited<ReturnType<typeof extractDocument>> | undefined;
  if (certificateFile instanceof File && certificateFile.size > 0) {
    const cocBuffer = new Uint8Array(await certificateFile.arrayBuffer());
    try {
      cocExtraction = await extractDocument(cocBuffer, certificateFile.name || "certificate.pdf");
    } catch (err) {
      return c.json(
        {
          error: "EXTRACTION_UNAVAILABLE",
          message: `pdf-extractor call failed on certificate: ${err instanceof Error ? err.message : String(err)}`,
        },
        502,
      );
    }
  }

  const tampering = detectTampering(docExtraction, cocExtraction);
  const authenticity = checkAuthenticity(docExtraction, claim, cocExtraction);
  const content = await contentExtractor.extractEmployment(docExtraction.text.content, claim);
  const { verdict, confidenceTier } = computeVerdict(tampering, authenticity, content);

  const response: VerifyResponse = {
    verdict,
    confidenceTier,
    signals: { tampering, authenticity, content },
    provenance: {
      fileHash: docExtraction.fileHash,
      certificateFileHash: cocExtraction?.fileHash,
      verifiedAt: new Date().toISOString(),
      verifier: SERVICE_NAME,
    },
  };

  return c.json(response);
});

app.onError((err, c) => {
  console.error("[document-verifier] unhandled error:", err);
  return c.json({ error: "INTERNAL_ERROR", message: String(err) }, 500);
});

const port = Number(process.env.PORT ?? 8787);
console.log(`[document-verifier] listening on http://localhost:${port}`);
console.log(`[document-verifier] content extractor: ${contentExtractor.name}`);
console.log(`[document-verifier] pdf-extractor at ${process.env.PDF_EXTRACTOR_URL ?? "http://localhost:8788"}`);

serve({ fetch: app.fetch, port });

export default app;
