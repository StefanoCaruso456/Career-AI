import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { getClaimTypeHandler, listClaimTypes } from "../claim-types/registry.js";
import { db, schema } from "../db/index.js";
import type { AppEnv } from "../hono-env.js";
import { submitClaim } from "../orchestrators/submit-claim.js";
import { VerificationError } from "../verifier/index.js";
import { buildPublicClaimRecord } from "../views/claim-view.js";

/**
 * Claim routes.
 *
 * Route handlers are intentionally thin — all business logic lives in
 * orchestrators, and all type-specific behavior lives in claim-type
 * handlers. A handler's job here is: parse input, validate shape, dispatch.
 */

export const claimsRoutes = new Hono<AppEnv>();

/**
 * Generic upload handler used by every /v1/claims/<kind> route. The kind
 * parameter must match a handler registered in the claim-types registry.
 */
async function handleClaimUpload(c: Context<AppEnv>, kind: string) {
  const actorDid = c.get("actorDid");
  const handler = getClaimTypeHandler(kind);
  if (!handler) {
    return c.json(
      {
        error: "UNSUPPORTED_CLAIM_TYPE",
        message: `Unknown claim type '${kind}'. Supported types: ${listClaimTypes().join(", ")}.`,
      },
      404,
    );
  }

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
    claim = handler.schema.parse(parsed);
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

  try {
    const result = await submitClaim(handler, {
      actorDid,
      file: buffer,
      filename: file.name || "upload.pdf",
      claim,
      certificateFile: certificateBuffer,
      certificateFilename,
    });
    return c.json(result);
  } catch (err) {
    // Map typed verification errors to meaningful HTTP codes. Anything else
    // bubbles up to the global onError handler (500).
    if (err instanceof VerificationError) {
      if (err.code === "EXTRACTION_UNAVAILABLE") {
        return c.json(
          {
            error: "SERVICE_UNAVAILABLE",
            message:
              "Document extraction service is temporarily unavailable. Please try again in a moment.",
          },
          502,
        );
      }
      if (err.code === "INVALID_REQUEST") {
        return c.json({ error: "INVALID_REQUEST", message: err.message }, 400);
      }
    }
    throw err;
  }
}

// One route per supported claim type. Each hands off to the same generic
// orchestrator via the registry — the kind parameter decides which handler.
claimsRoutes.post("/offer-letter", (c) => handleClaimUpload(c, "offer-letter"));
claimsRoutes.post("/employment-verification", (c) =>
  handleClaimUpload(c, "employment-verification"),
);

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
  const [verificationRows, badgeRows] = await Promise.all([
    db
      .select()
      .from(schema.verifications)
      .where(inArray(schema.verifications.claimId, ids))
      .orderBy(desc(schema.verifications.createdAt)),
    db
      .select()
      .from(schema.badges)
      .where(inArray(schema.badges.claimId, ids)),
  ]);

  // First row per claim wins because we ordered by createdAt desc.
  const latestByClaim = new Map<string, (typeof verificationRows)[number]>();
  for (const v of verificationRows) {
    if (!latestByClaim.has(v.claimId)) latestByClaim.set(v.claimId, v);
  }
  const badgeByClaim = new Map<string, (typeof badgeRows)[number]>();
  for (const b of badgeRows) badgeByClaim.set(b.claimId, b);

  const claims = claimRows.map((claim) =>
    buildPublicClaimRecord(
      claim,
      latestByClaim.get(claim.id) ?? null,
      badgeByClaim.get(claim.id) ?? null,
    ),
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

  const [[verification], [badge]] = await Promise.all([
    db
      .select()
      .from(schema.verifications)
      .where(eq(schema.verifications.claimId, id))
      .orderBy(desc(schema.verifications.createdAt))
      .limit(1),
    db
      .select()
      .from(schema.badges)
      .where(eq(schema.badges.claimId, id))
      .limit(1),
  ]);

  return c.json({
    claim: buildPublicClaimRecord(claim, verification ?? null, badge ?? null),
  });
});
