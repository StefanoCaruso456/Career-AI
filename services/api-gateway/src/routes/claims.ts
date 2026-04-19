import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../hono-env.js";
import { submitEmploymentClaim } from "../orchestrators/employment-claim.js";

/**
 * Claim routes.
 *
 * Route handlers are intentionally thin — all business logic lives in
 * orchestrators. A handler's job is: parse input, validate shape, delegate,
 * return result. If you find yourself writing `if (verdict === ...)` here,
 * move it to an orchestrator.
 */

export const claimsRoutes = new Hono<AppEnv>();

const employmentClaimSchema = z.object({
  employer: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Uploader's account display name. Optional on the wire; when absent the
   * recipient-match check is skipped by the content extractor.
   */
  userAccountName: z.string().min(1).max(200).optional(),
});

claimsRoutes.post("/employment", async (c) => {
  const actorDid = c.get("actorDid");

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json(
      { error: "INVALID_REQUEST", message: "Expected multipart/form-data body." },
      400,
    );
  }

  const file = form.get("file");
  const certificate = form.get("certificate"); // optional separate CoC
  const claimRaw = form.get("claim");

  if (!(file instanceof File)) {
    return c.json(
      { error: "INVALID_REQUEST", message: "Missing 'file' field (expected a PDF upload)." },
      400,
    );
  }
  if (typeof claimRaw !== "string") {
    return c.json(
      { error: "INVALID_REQUEST", message: "Missing 'claim' field (expected a JSON string)." },
      400,
    );
  }

  let claim;
  try {
    const parsed = JSON.parse(claimRaw);
    claim = employmentClaimSchema.parse(parsed);
  } catch (err) {
    return c.json(
      { error: "VALIDATION_FAILED", message: "Invalid claim JSON.", details: String(err) },
      400,
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    return c.json({ error: "INVALID_REQUEST", message: "Uploaded file is empty." }, 400);
  }

  let certificateBuffer: Uint8Array | undefined;
  let certificateFilename: string | undefined;
  if (certificate instanceof File && certificate.size > 0) {
    certificateBuffer = new Uint8Array(await certificate.arrayBuffer());
    certificateFilename = certificate.name || "certificate.pdf";
  }

  const result = await submitEmploymentClaim({
    actorDid,
    file: buffer,
    filename: file.name || "upload.pdf",
    claim,
    certificateFile: certificateBuffer,
    certificateFilename,
  });

  return c.json(result);
});
