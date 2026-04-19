import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import type { AppEnv } from "../hono-env.js";
import { submitEmploymentClaim } from "../orchestrators/employment-claim.js";
import { buildPublicClaimRecord } from "../views/claim-view.js";

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

/**
 * GET /v1/claims
 *
 * Lists the authenticated actor's claims with their latest verification.
 * Scoped to `actorDid` from the auth middleware — there is no way for a
 * caller to read another user's claims through this endpoint, even though
 * Career-AI holds the shared secret. Scoping lives server-side.
 *
 * No pagination for the demo; capped at a safe ceiling.
 */
const CLAIMS_LIST_LIMIT = 100;

claimsRoutes.get("/", async (c) => {
  const actorDid = c.get("actorDid");

  const claimRows = await db
    .select()
    .from(schema.claims)
    .where(eq(schema.claims.ownerDid, actorDid))
    .orderBy(desc(schema.claims.createdAt))
    .limit(CLAIMS_LIST_LIMIT);

  if (claimRows.length === 0) {
    return c.json({ claims: [] });
  }

  const ids = claimRows.map((r) => r.id);
  const verificationRows = await db
    .select()
    .from(schema.verifications)
    .where(inArray(schema.verifications.claimId, ids))
    .orderBy(desc(schema.verifications.createdAt));

  // First row per claim wins because we ordered by createdAt desc.
  const latestByClaim = new Map<string, (typeof verificationRows)[number]>();
  for (const v of verificationRows) {
    if (!latestByClaim.has(v.claimId)) latestByClaim.set(v.claimId, v);
  }

  const claims = claimRows.map((claim) =>
    buildPublicClaimRecord(claim, latestByClaim.get(claim.id) ?? null),
  );

  return c.json({ claims });
});

/**
 * GET /v1/claims/:id
 *
 * Returns a single claim + latest verification, scoped to the authenticated
 * actor. Returns 404 rather than 403 if the id exists but is owned by a
 * different DID — we do not reveal ownership to unrelated callers.
 */
const claimIdSchema = z.string().uuid();

claimsRoutes.get("/:id", async (c) => {
  const actorDid = c.get("actorDid");

  const parse = claimIdSchema.safeParse(c.req.param("id"));
  if (!parse.success) {
    return c.json({ error: "NOT_FOUND", message: "Claim not found." }, 404);
  }
  const id = parse.data;

  const [claim] = await db
    .select()
    .from(schema.claims)
    .where(and(eq(schema.claims.id, id), eq(schema.claims.ownerDid, actorDid)))
    .limit(1);

  if (!claim) {
    return c.json({ error: "NOT_FOUND", message: "Claim not found." }, 404);
  }

  const [verification] = await db
    .select()
    .from(schema.verifications)
    .where(eq(schema.verifications.claimId, id))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);

  return c.json({ claim: buildPublicClaimRecord(claim, verification ?? null) });
});
