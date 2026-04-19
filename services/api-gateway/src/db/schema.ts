import { integer, jsonb, pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

/**
 * A candidate's claim about their career history.
 *
 * For the demo we only support `employment` claim_type. More types
 * (education, certification, skill, endorsement) slot in the same shape.
 *
 * The payload is the raw structured claim as the user submitted it. The
 * verification lifecycle runs against this payload, not a normalized copy,
 * so we preserve exactly what the user said.
 */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerDid: text("owner_did").notNull(),
    claimType: text("claim_type").notNull(),
    status: text("status").notNull().default("PENDING"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("claims_owner_did_idx").on(t.ownerDid),
    typeIdx: index("claims_type_idx").on(t.claimType),
  }),
);

/**
 * A single verification attempt against a claim.
 *
 * Every time a claim is verified (by a service, a human reviewer, a sync
 * adapter, etc.), a row is appended here. We never mutate verification rows.
 * The claim's current status is derived from the latest verification.
 */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    verifier: text("verifier").notNull(),
    verdict: text("verdict").notNull(),
    confidenceTier: text("confidence_tier").notNull(),
    signals: jsonb("signals").notNull(),
    provenance: jsonb("provenance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    claimIdx: index("verifications_claim_id_idx").on(t.claimId),
  }),
);

/**
 * A verified credential ("badge") issued for a claim.
 *
 * Populated only when a verification yields `VERIFIED`. One badge per
 * verified claim. The `payload` holds the ground-truth claim data plus the
 * authenticity/confidence metadata that was true at issuance time.
 *
 * This is intentionally pre-W3C: the shape is minimal so the transition to
 * signed W3C Verifiable Credentials changes only the `payload` contents
 * (a `{kind: "vc-employment", vc: "<jwt|ld+json>"}` blob) without moving
 * IDs, ownership, or the public read path. The read endpoints already hide
 * the internal signal blobs, so swapping the payload format is transparent
 * to the frontend.
 */
export const badges = pgTable(
  "badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    subjectDid: text("subject_did").notNull(),
    issuerDid: text("issuer_did").notNull(),
    badgeType: text("badge_type").notNull(),
    payload: jsonb("payload").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    subjectIdx: index("badges_subject_did_idx").on(t.subjectDid),
    claimIdx: index("badges_claim_id_idx").on(t.claimId),
  }),
);

/**
 * Audit log of inbound gateway requests. Captures who called what and with
 * what outcome. Never stores request/response bodies (PII risk) — only the
 * metadata needed for debugging and compliance.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorDid: text("actor_did"),
    method: text("method").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    correlationIdx: index("audit_events_correlation_idx").on(t.correlationId),
    createdIdx: index("audit_events_created_idx").on(t.createdAt),
  }),
);
