import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { publicOrigin } from "@/auth";
import {
  ApiError,
  createGovernmentIdVerificationSessionInputSchema,
  governmentIdVerificationResultSchema,
  governmentIdVerificationSessionSchema,
  type CareerIdDocumentVerificationState,
  type CareerIdEvidenceItem,
  type CareerIdProfile,
  type CareerIdVerificationStatus,
  type CareerPhaseProgress,
  type GovernmentIdVerificationResult,
  type TrustLayer,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { createTalentIdentity, findTalentIdentityByEmail } from "@/packages/identity-domain/src";
import {
  createCareerIdAuditEvent,
  findCareerIdVerificationByProviderReferenceHash,
  getCareerIdAuditEventByProviderEvent,
  getCareerIdEvidenceById,
  getCareerIdVerificationById,
  listCareerIdEvidence,
  listCareerIdVerifications,
  resetCareerIdGovernmentVerificationState,
  upsertCareerIdEvidence,
  upsertCareerIdVerification,
  type CareerIdEvidenceRecord,
  type CareerIdVerificationRecord,
} from "@/packages/persistence/src";
import {
  buildPersonaHostedLaunchUrl,
  createPersonaInquiry,
  generatePersonaOneTimeLink,
  getPersonaWebhookSecret,
  retrievePersonaInquiry,
  type PersonaInquiryResource,
} from "./persona";

type Viewer = {
  email: string;
  name?: string | null;
  talentIdentityId?: string | null;
};

type SplitName = {
  displayName: string;
  firstName: string;
  lastName: string;
};

type ResolvedViewerIdentity = {
  careerIdentityId: string;
  displayName: string;
  firstName: string;
  lastName: string;
};

type GovernmentIdChecks = GovernmentIdVerificationResult["checks"];

type PersonaWebhookEnvelope = {
  data?: {
    id?: string;
    attributes?: {
      "created-at"?: string;
      name?: string;
      payload?: {
        data?: PersonaInquiryResource;
      };
    };
  };
};

type PersonaIncludedResource = {
  attributes?: Record<string, unknown>;
  id?: string;
  type?: string;
};

type NormalizedPersonaInquiryResult = {
  checks: GovernmentIdChecks;
  completedAt: string | null;
  confidenceBand: GovernmentIdVerificationResult["confidenceBand"];
  metadata: Record<string, unknown>;
  recoveryHints: string[];
  status: CareerIdVerificationStatus;
};

type GovernmentIdVerificationStatusResponse = ReturnType<
  typeof governmentIdVerificationResultSchema.parse
>;

const GOVERNMENT_ID_EXPLANATION =
  "We verify your government ID and compare it with a live selfie to strengthen your Career ID.";
const GOVERNMENT_ID_RECOVERY_HINTS = [
  "Use good lighting.",
  "Make sure your document is sharp and readable.",
  "Keep your full face visible during the live selfie.",
];
const DEFAULT_GOVERNMENT_ID_IN_PROGRESS_STALE_TIMEOUT_MS = 10 * 60 * 1000;

const trustLayerTitleByPhase: Record<TrustLayer, string> = {
  self_reported: "Self-reported",
  relationship_backed: "Relationship-backed",
  document_backed: "Document-backed",
  signature_backed: "Signature-backed",
  institution_verified: "Institution-verified",
};

const trustLayerDescriptionByPhase: Record<TrustLayer, string> = {
  self_reported:
    "Add your foundation profile details so the rest of your trust ladder has context.",
  relationship_backed:
    "Add endorsements from trusted people who can validate your outcomes.",
  document_backed:
    "Verify government ID or upload offer, employment, education, and transcript proof.",
  signature_backed:
    "Add employer-backed verification that carries stronger reviewer confidence.",
  institution_verified:
    "Anchor the profile to government-issued identity verification.",
};

declare global {
  // eslint-disable-next-line no-var
  var __careerIdGovernmentIdSessionRateLimit:
    | Map<string, { count: number; resetAt: number }>
    | undefined;
}

function getGovernmentIdSessionRateLimitStore() {
  if (!globalThis.__careerIdGovernmentIdSessionRateLimit) {
    globalThis.__careerIdGovernmentIdSessionRateLimit = new Map();
  }

  return globalThis.__careerIdGovernmentIdSessionRateLimit;
}

function splitDisplayName(name: string | null | undefined, email: string): SplitName {
  const trimmed = name?.trim();

  if (!trimmed) {
    const fallback = email.split("@")[0] ?? "Career";
    return {
      firstName: fallback,
      lastName: "User",
      displayName: fallback,
    };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const [firstName = "Career", ...rest] = parts;
  const lastName = rest.join(" ") || "User";

  return {
    firstName,
    lastName,
    displayName: trimmed,
  };
}

function getGovernmentIdEncryptionSeed() {
  return (
    process.env.CAREER_ID_PROVIDER_REFERENCE_ENCRYPTION_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    (process.env.NODE_ENV === "test" ? "career-id-test-secret" : "")
  );
}

function getGovernmentIdEncryptionKey() {
  const seed = getGovernmentIdEncryptionSeed();

  if (!seed) {
    throw new ApiError({
      errorCode: "DEPENDENCY_FAILURE",
      status: 503,
      message:
        "A provider reference encryption key or auth secret is required for Career ID verification.",
      correlationId: "career_id_encryption_key_missing",
    });
  }

  return createHash("sha256").update(seed).digest();
}

function hashProviderReference(referenceId: string) {
  return createHmac("sha256", getGovernmentIdEncryptionKey())
    .update(referenceId)
    .digest("hex");
}

function encryptProviderReference(referenceId: string) {
  const key = getGovernmentIdEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(referenceId, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString(
    "base64url",
  )}`;
}

function decryptProviderReference(ciphertext: string) {
  const [ivValue, tagValue, encryptedValue] = ciphertext.split(".");

  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid provider reference ciphertext.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getGovernmentIdEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function defaultChecks(): GovernmentIdChecks {
  return {
    documentAuthenticity: "unknown",
    liveness: "unknown",
    faceMatch: "unknown",
  };
}

function isRetryableStatus(status: CareerIdVerificationStatus) {
  return status === "retry_needed" || status === "failed";
}

function getGovernmentIdInProgressStaleTimeoutMs() {
  const configured = Number(
    process.env.CAREER_ID_GOVERNMENT_ID_IN_PROGRESS_STALE_TIMEOUT_MS ??
      `${DEFAULT_GOVERNMENT_ID_IN_PROGRESS_STALE_TIMEOUT_MS}`,
  );

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_GOVERNMENT_ID_IN_PROGRESS_STALE_TIMEOUT_MS;
  }

  return configured;
}

function isGovernmentIdVerificationStale(verification: CareerIdVerificationRecord) {
  if (verification.status !== "in_progress") {
    return false;
  }

  const updatedAtMs = Date.parse(verification.updatedAt);

  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }

  return Date.now() - updatedAtMs >= getGovernmentIdInProgressStaleTimeoutMs();
}

function getLatestGovernmentIdVerification(
  verifications: CareerIdVerificationRecord[],
) {
  return verifications.find((record) => record.type === "government_id") ?? null;
}

function getGovernmentIdEvidence(evidenceRecords: CareerIdEvidenceRecord[]) {
  return evidenceRecords.find((record) => record.type === "government_id") ?? null;
}

function derivePhaseStatus(args: {
  completedCount: number;
  evidenceStatus?: CareerIdVerificationStatus | null;
  phase: TrustLayer;
  progress: CareerPhaseProgress;
  unlocked: boolean;
}) {
  if (!args.unlocked) {
    return "locked" as const;
  }

  if (args.phase === "document_backed" && args.evidenceStatus) {
    if (args.evidenceStatus !== "not_started") {
      return args.evidenceStatus;
    }
  }

  if (args.completedCount > 0 && args.completedCount >= args.progress.total) {
    return "verified" as const;
  }

  if (args.progress.started > 0) {
    return "in_progress" as const;
  }

  return "not_started" as const;
}

function phaseToTrustLayer(phase: CareerPhaseProgress["phase"]): TrustLayer {
  switch (phase) {
    case "self":
      return "self_reported";
    case "relationship":
      return "relationship_backed";
    case "document":
      return "document_backed";
    case "signature":
      return "signature_backed";
    case "institution":
      return "institution_verified";
  }
}

function toGovernmentIdEvidenceItem(
  evidence: CareerIdEvidenceRecord,
  verification: CareerIdVerificationRecord | null,
): CareerIdEvidenceItem {
  return {
    id: evidence.id,
    type: evidence.type,
    provider: evidence.provider ?? undefined,
    providerReferenceId: verification
      ? decryptProviderReference(verification.providerReferenceEncrypted)
      : undefined,
    status: evidence.status,
    confidenceBand: evidence.confidenceBand ?? undefined,
    createdAt: evidence.createdAt,
    completedAt: evidence.completedAt ?? undefined,
    manualReviewRequired: evidence.manualReviewRequired,
    metadata: evidence.metadata,
  };
}

function toGovernmentIdVerificationResult(
  verification: CareerIdVerificationRecord,
  evidenceId: string | null,
): GovernmentIdVerificationStatusResponse {
  return governmentIdVerificationResultSchema.parse({
    verificationId: verification.id,
    evidenceId,
    status: verification.status,
    checks: verification.checks,
    confidenceBand: verification.confidenceBand ?? undefined,
    provider: "persona",
    providerReferenceId: decryptProviderReference(verification.providerReferenceEncrypted),
    completedAt: verification.completedAt,
    retryable: isRetryableStatus(verification.status),
  });
}

function computeDocumentHelperText(status: CareerIdVerificationStatus, unlocked: boolean) {
  if (!unlocked || status === "locked") {
    return "Start here with a government ID and live selfie to anchor your Career ID.";
  }

  switch (status) {
    case "verified":
      return "Government ID verified and added to your Career ID.";
    case "in_progress":
      return "We're checking your ID and live selfie.";
    case "manual_review":
      return "We're reviewing your verification. This can take a little longer.";
    case "retry_needed":
      return "Try again with better lighting, a clearer document photo, and your full face visible.";
    case "failed":
      return "Verification was not completed. You can try again if you'd like.";
    case "not_started":
    default:
      return "Start here with a government ID and live selfie to anchor your Career ID.";
  }
}

function computeDocumentCtaLabel(status: CareerIdVerificationStatus, unlocked: boolean) {
  if (!unlocked) {
    return null;
  }

  switch (status) {
    case "verified":
      return "Reverify identity";
    case "in_progress":
    case "manual_review":
      return "Check verification status";
    case "retry_needed":
    case "failed":
      return "Try again";
    case "not_started":
      return "Verify your identity";
    default:
      return null;
  }
}

function buildAbsoluteReturnUrl(args: {
  requestOrigin?: string | null;
  returnUrl: string;
  verificationId: string;
}) {
  const configuredOrigin = publicOrigin?.trim();
  const requestOrigin = args.requestOrigin?.trim();
  const origin = configuredOrigin || requestOrigin || "http://localhost:3000";
  const url = new URL(args.returnUrl, origin);
  url.searchParams.set("careerIdVerificationId", args.verificationId);
  return url.toString();
}

function extractRecoveryHints(text: string) {
  const hints: string[] = [];

  if (/(lighting|glare|dark|shadow)/.test(text)) {
    hints.push("Improve the lighting and avoid glare.");
  }

  if (/(blur|blurry|sharp|readable|cropped|edge)/.test(text)) {
    hints.push("Retake your document photo so all edges are sharp and readable.");
  }

  if (/(face|selfie|visible|sunglasses|occluded|liveness)/.test(text)) {
    hints.push("Make sure your full face is visible for the live selfie.");
  }

  return hints.length > 0 ? hints : [...GOVERNMENT_ID_RECOVERY_HINTS];
}

function determineFailureChecks(text: string): GovernmentIdChecks {
  return {
    documentAuthenticity: /(document|blur|blurry|glare|cropped|readable|edge)/.test(text)
      ? "fail"
      : "unknown",
    liveness: /(selfie|liveness|face|visible|camera|lighting)/.test(text) ? "fail" : "unknown",
    faceMatch: /(face.?match|same person|selfie|face)/.test(text) ? "fail" : "unknown",
  };
}

function normalizePersonaStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function getInquiryAttribute(
  inquiry: PersonaInquiryResource | null | undefined,
  key: string,
) {
  return inquiry?.attributes?.[key];
}

function getPersonaIncludedResources(
  inquiry: PersonaInquiryResource | null | undefined,
): PersonaIncludedResource[] {
  if (!Array.isArray(inquiry?.included)) {
    return [];
  }

  return inquiry.included.filter(
    (resource): resource is PersonaIncludedResource =>
      Boolean(resource) && typeof resource === "object",
  );
}

function getPersonaVerificationResources(
  inquiry: PersonaInquiryResource | null | undefined,
  typePrefix: string,
) {
  return getPersonaIncludedResources(inquiry).filter((resource) => {
    const resourceType = resource.type?.trim().toLowerCase();
    return resourceType?.startsWith(typePrefix);
  });
}

function getPersonaVerificationCheckStatus(
  resource: PersonaIncludedResource,
  checkNames: string[],
) {
  const checks = resource.attributes?.checks;

  if (!Array.isArray(checks)) {
    return "unknown" as const;
  }

  const normalizedTargetNames = new Set(checkNames.map((name) => normalizePersonaStatus(name)));

  for (const check of checks) {
    if (!check || typeof check !== "object") {
      continue;
    }

    const normalizedName = normalizePersonaStatus((check as { name?: unknown }).name);

    if (!normalizedTargetNames.has(normalizedName)) {
      continue;
    }

    const normalizedStatus = normalizePersonaStatus((check as { status?: unknown }).status);

    if (normalizedStatus === "passed") {
      return "pass" as const;
    }

    if (normalizedStatus === "failed") {
      return "fail" as const;
    }
  }

  return "unknown" as const;
}

function deriveVerificationChecksFromPersonaInquiry(
  inquiry: PersonaInquiryResource | null | undefined,
): GovernmentIdChecks {
  const governmentIdResources = getPersonaVerificationResources(
    inquiry,
    "verification/government-id",
  );
  const selfieResources = getPersonaVerificationResources(inquiry, "verification/selfie");
  const governmentIdPassed = governmentIdResources.some(
    (resource) => normalizePersonaStatus(resource.attributes?.status) === "passed",
  );
  const governmentIdFailed = governmentIdResources.some(
    (resource) => normalizePersonaStatus(resource.attributes?.status) === "failed",
  );
  const selfiePassed = selfieResources.some(
    (resource) => normalizePersonaStatus(resource.attributes?.status) === "passed",
  );
  const liveness = selfieResources.reduce<GovernmentIdChecks["liveness"]>((result, resource) => {
    if (result === "pass") {
      return result;
    }

    const checkStatus = getPersonaVerificationCheckStatus(resource, ["selfie_liveness_detection"]);
    return checkStatus === "unknown" ? result : checkStatus;
  }, "unknown");
  const faceMatch = selfieResources.reduce<GovernmentIdChecks["faceMatch"]>((result, resource) => {
    if (result === "pass") {
      return result;
    }

    const checkStatus = getPersonaVerificationCheckStatus(resource, ["selfie_id_comparison"]);
    return checkStatus === "unknown" ? result : checkStatus;
  }, "unknown");

  return {
    documentAuthenticity: governmentIdPassed
      ? "pass"
      : governmentIdFailed
        ? "fail"
        : "unknown",
    liveness: liveness !== "unknown" ? liveness : selfiePassed ? "pass" : "unknown",
    faceMatch:
      faceMatch !== "unknown"
        ? faceMatch
        : selfiePassed && governmentIdPassed
          ? "pass"
          : "unknown",
  };
}

function areGovernmentIdChecksEqual(left: GovernmentIdChecks, right: GovernmentIdChecks) {
  return (
    left.documentAuthenticity === right.documentAuthenticity &&
    left.liveness === right.liveness &&
    left.faceMatch === right.faceMatch
  );
}

function shouldSyncGovernmentIdVerificationStatus(status: CareerIdVerificationStatus) {
  return status === "in_progress" || status === "manual_review";
}

const PERSONA_MANUAL_REVIEW_STATUSES = new Set(["needs-review", "marked-for-review", "reviewing"]);
const PERSONA_MANUAL_REVIEW_EVENTS = new Set([
  "inquiry.marked-for-review",
  "inquiry.needs-review",
  "inquiry.needs_review",
]);
const PERSONA_IN_PROGRESS_STATUSES = new Set(["pending", "created", "started", "initiated"]);
const PERSONA_RETRY_NEEDED_STATUSES = new Set([
  "failed",
  "expired",
  "abandoned",
  "canceled",
  "cancelled",
  "requires-retry",
  "retry-needed",
  "needs-resubmission",
]);
const PERSONA_RETRY_NEEDED_EVENTS = new Set([
  "inquiry.failed",
  "inquiry.expired",
  "inquiry.abandoned",
  "inquiry.canceled",
  "inquiry.cancelled",
]);
const PERSONA_FAILED_STATUSES = new Set(["declined"]);
const PERSONA_FAILED_EVENTS = new Set(["inquiry.declined"]);

export function normalizePersonaInquiry(args: {
  eventName?: string | null;
  inquiry: PersonaInquiryResource | null | undefined;
}): NormalizedPersonaInquiryResult {
  const rawStatus = normalizePersonaStatus(getInquiryAttribute(args.inquiry, "status"));
  const eventName = normalizePersonaStatus(args.eventName);
  const text = JSON.stringify(args.inquiry ?? {}).toLowerCase();
  const recoveryHints = extractRecoveryHints(text);
  const completedAt =
    typeof getInquiryAttribute(args.inquiry, "completed-at") === "string"
      ? String(getInquiryAttribute(args.inquiry, "completed-at"))
      : null;

  let status: CareerIdVerificationStatus = "in_progress";

  if (rawStatus === "approved" || eventName === "inquiry.approved") {
    status = "verified";
  } else if (rawStatus === "completed" || eventName === "inquiry.completed") {
    status = "verified";
  } else if (
    PERSONA_MANUAL_REVIEW_STATUSES.has(rawStatus) ||
    PERSONA_MANUAL_REVIEW_EVENTS.has(eventName)
  ) {
    status = "manual_review";
  } else if (
    PERSONA_RETRY_NEEDED_STATUSES.has(rawStatus) ||
    PERSONA_RETRY_NEEDED_EVENTS.has(eventName) ||
    PERSONA_FAILED_STATUSES.has(rawStatus) ||
    PERSONA_FAILED_EVENTS.has(eventName)
  ) {
    const hasRecoverableCaptureIssue = /(blur|blurry|lighting|glare|face|selfie|visible|readable|edge|cropped)/.test(
      text,
    );
    const shouldRetry =
      PERSONA_RETRY_NEEDED_STATUSES.has(rawStatus) ||
      PERSONA_RETRY_NEEDED_EVENTS.has(eventName) ||
      hasRecoverableCaptureIssue;
    status = shouldRetry ? "retry_needed" : "failed";
  } else if (PERSONA_IN_PROGRESS_STATUSES.has(rawStatus)) {
    status = "in_progress";
  }

  const checksFromInquiry = deriveVerificationChecksFromPersonaInquiry(args.inquiry);
  const checks: GovernmentIdChecks =
    status === "verified"
      ? {
          documentAuthenticity:
            checksFromInquiry.documentAuthenticity === "unknown"
              ? "pass"
              : checksFromInquiry.documentAuthenticity,
          liveness: checksFromInquiry.liveness === "unknown" ? "pass" : checksFromInquiry.liveness,
          faceMatch: checksFromInquiry.faceMatch === "unknown" ? "pass" : checksFromInquiry.faceMatch,
        }
      : status === "retry_needed" || status === "failed"
        ? determineFailureChecks(text)
        : checksFromInquiry;

  const confidenceBand: GovernmentIdVerificationResult["confidenceBand"] =
    status === "verified"
      ? "high"
      : status === "manual_review" || status === "in_progress"
        ? "medium"
        : "low";

  return {
    status,
    checks,
    confidenceBand,
    completedAt: status === "verified" ? completedAt ?? new Date().toISOString() : null,
    recoveryHints,
    metadata: {
      eventName: args.eventName ?? null,
      rawStatus: rawStatus || null,
      inquiryStatus:
        typeof getInquiryAttribute(args.inquiry, "status") === "string"
          ? getInquiryAttribute(args.inquiry, "status")
          : null,
      completedAt,
    },
  };
}

async function syncGovernmentIdVerificationFromPersona(args: {
  correlationId: string;
  verification: CareerIdVerificationRecord;
}) {
  if (args.verification.provider !== "persona") {
    return args.verification;
  }

  const inquiryId = decryptProviderReference(args.verification.providerReferenceEncrypted);
  const inquiry = await retrievePersonaInquiry({
    correlationId: args.correlationId,
    inquiryId,
  });
  const normalized = normalizePersonaInquiry({
    inquiry,
  });
  const manualReviewRequired = normalized.status === "manual_review";
  const isUnchanged =
    args.verification.status === normalized.status &&
    args.verification.confidenceBand === (normalized.confidenceBand ?? null) &&
    args.verification.completedAt === normalized.completedAt &&
    args.verification.manualReviewRequired === manualReviewRequired &&
    areGovernmentIdChecksEqual(args.verification.checks, normalized.checks);

  if (isUnchanged) {
    return args.verification;
  }

  const updatedVerification = await upsertCareerIdVerification({
    record: {
      ...args.verification,
      status: normalized.status,
      confidenceBand: normalized.confidenceBand ?? null,
      checks: normalized.checks,
      manualReviewRequired,
      completedAt: normalized.completedAt,
      updatedAt: new Date().toISOString(),
    },
  });
  const existingEvidence = getGovernmentIdEvidence(
    await listCareerIdEvidence({
      careerIdentityId: args.verification.careerIdentityId,
    }),
  );

  await upsertGovernmentIdEvidence({
    careerIdentityId: args.verification.careerIdentityId,
    existingEvidenceId: existingEvidence?.id,
    providerReferenceEncrypted: args.verification.providerReferenceEncrypted,
    providerReferenceHash: args.verification.providerReferenceHash,
    recoveryHints: normalized.recoveryHints,
    verificationId: args.verification.id,
    result: normalized,
  });

  logAuditEvent({
    eventType: "persona_status_synced",
    actorType: "system_service",
    actorId: "persona_status_sync",
    targetType: "career_id_verification",
    targetId: args.verification.id,
    correlationId: args.correlationId,
    metadataJson: {
      normalizedStatus: normalized.status,
      provider: "persona",
      source: "verification_status_read",
    },
  });

  if (args.verification.status !== "verified" && updatedVerification.status === "verified") {
    logAuditEvent({
      eventType: "badge_created",
      actorType: "system_service",
      actorId: "persona_status_sync",
      targetType: "career_id_verification",
      targetId: args.verification.id,
      correlationId: args.correlationId,
      metadataJson: {
        badgeLabel: "Government ID verified",
      },
    });
  }

  return updatedVerification;
}

async function resolveViewerIdentity(args: {
  correlationId: string;
  viewer: Viewer;
}): Promise<ResolvedViewerIdentity> {
  if (!args.viewer.email?.trim()) {
    throw new ApiError({
      errorCode: "UNAUTHORIZED",
      status: 401,
      message: "Sign in to manage Career ID verification.",
      correlationId: args.correlationId,
    });
  }

  const existing = await findTalentIdentityByEmail({
    email: args.viewer.email,
    correlationId: args.correlationId,
  });

  if (existing) {
    const name = splitDisplayName(existing.talentIdentity.display_name, args.viewer.email);
    return {
      careerIdentityId: existing.talentIdentity.id,
      displayName: existing.talentIdentity.display_name,
      firstName: name.firstName,
      lastName: name.lastName,
    };
  }

  const name = splitDisplayName(args.viewer.name, args.viewer.email);
  const created = await createTalentIdentity({
    input: {
      email: args.viewer.email,
      firstName: name.firstName,
      lastName: name.lastName,
      countryCode: "US",
    },
    actorType: "talent_user",
    actorId: args.viewer.email,
    correlationId: args.correlationId,
  });

  return {
    careerIdentityId: created.talentIdentity.id,
    displayName: created.talentIdentity.display_name,
    firstName: name.firstName,
    lastName: name.lastName,
  };
}

function assertGovernmentIdSessionAllowed(careerIdentityId: string, correlationId: string) {
  const maxRequests = Number(process.env.CAREER_ID_GOVERNMENT_ID_SESSION_RATE_LIMIT_MAX ?? "5");
  const windowMs = Number(process.env.CAREER_ID_GOVERNMENT_ID_SESSION_RATE_LIMIT_WINDOW_MS ?? "600000");
  const now = Date.now();
  const store = getGovernmentIdSessionRateLimitStore();
  const entry = store.get(careerIdentityId);

  if (!entry || entry.resetAt <= now) {
    store.set(careerIdentityId, {
      count: 1,
      resetAt: now + windowMs,
    });
    return;
  }

  if (entry.count >= maxRequests) {
    throw new ApiError({
      errorCode: "RATE_LIMITED",
      status: 429,
      message: "Too many verification attempts. Please wait a few minutes and try again.",
      correlationId,
    });
  }

  entry.count += 1;
  store.set(careerIdentityId, entry);
}

async function upsertGovernmentIdEvidence(args: {
  careerIdentityId: string;
  existingEvidenceId?: string | null;
  providerReferenceEncrypted: string;
  providerReferenceHash: string;
  recoveryHints: string[];
  result: Pick<
    NormalizedPersonaInquiryResult,
    "checks" | "completedAt" | "confidenceBand" | "metadata" | "status"
  >;
  verificationId: string;
}) {
  return upsertCareerIdEvidence({
    record: {
      id: args.existingEvidenceId ?? `career_id_evidence_${crypto.randomUUID()}`,
      careerIdentityId: args.careerIdentityId,
      phase: "document_backed",
      label: "Government ID verified",
      type: "government_id",
      provider: "persona",
      providerReferenceHash: args.providerReferenceHash,
      providerReferenceEncrypted: args.providerReferenceEncrypted,
      status: args.result.status,
      confidenceBand: args.result.confidenceBand ?? null,
      manualReviewRequired: args.result.status === "manual_review",
      metadata: {
        checks: args.result.checks,
        recoveryHints: args.recoveryHints,
        verificationId: args.verificationId,
        ...args.result.metadata,
      },
      completedAt: args.result.completedAt,
    },
  });
}

async function autoResetStaleInProgressGovernmentVerification(args: {
  correlationId: string;
  evidence: CareerIdEvidenceRecord | null;
  verification: CareerIdVerificationRecord | null;
}) {
  if (!args.verification || !isGovernmentIdVerificationStale(args.verification)) {
    return {
      evidence: args.evidence,
      verification: args.verification,
    };
  }

  const timedOutAt = new Date().toISOString();
  const staleTimeoutMs = getGovernmentIdInProgressStaleTimeoutMs();
  const updatedVerification = await upsertCareerIdVerification({
    record: {
      ...args.verification,
      status: "retry_needed",
      confidenceBand: "low",
      manualReviewRequired: false,
      completedAt: null,
      updatedAt: timedOutAt,
    },
  });
  const updatedEvidence = await upsertGovernmentIdEvidence({
    careerIdentityId: args.verification.careerIdentityId,
    existingEvidenceId: args.evidence?.id,
    providerReferenceEncrypted: args.verification.providerReferenceEncrypted,
    providerReferenceHash: args.verification.providerReferenceHash,
    recoveryHints: [...GOVERNMENT_ID_RECOVERY_HINTS],
    verificationId: args.verification.id,
    result: {
      status: "retry_needed",
      checks: args.verification.checks,
      confidenceBand: "low",
      completedAt: null,
      metadata: {
        autoResetReason: "in_progress_timeout",
        staleTimeoutMs,
        timedOutAt,
      },
    },
  });

  logAuditEvent({
    eventType: "verification_auto_reset",
    actorType: "system_service",
    actorId: "career_id_timeout_guard",
    targetType: "career_id_verification",
    targetId: args.verification.id,
    correlationId: args.correlationId,
    metadataJson: {
      reason: "in_progress_timeout",
      staleTimeoutMs,
      previousStatus: args.verification.status,
    },
  });

  return {
    evidence: updatedEvidence,
    verification: updatedVerification,
  };
}

function ensureVerificationOwnership(
  verification: CareerIdVerificationRecord | null,
  careerIdentityId: string,
  correlationId: string,
) {
  if (!verification || verification.careerIdentityId !== careerIdentityId) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Career ID verification was not found.",
      correlationId,
    });
  }

  return verification;
}

function computeDocumentVerificationStatus(args: {
  evidence: CareerIdEvidenceRecord | null;
  latestVerification: CareerIdVerificationRecord | null;
  unlocked: boolean;
}) {
  if (!args.unlocked) {
    return "locked" as const;
  }

  if (args.latestVerification) {
    return args.latestVerification.status;
  }

  if (args.evidence) {
    return args.evidence.status;
  }

  return "not_started" as const;
}

export async function getCareerIdPresentation(args: {
  careerIdentityId: string;
  correlationId: string;
  phaseProgress: CareerPhaseProgress[];
}) {
  let [evidenceRecords, verifications] = await Promise.all([
    listCareerIdEvidence({
      careerIdentityId: args.careerIdentityId,
    }),
    listCareerIdVerifications({
      careerIdentityId: args.careerIdentityId,
    }),
  ]);
  let latestVerification = getLatestGovernmentIdVerification(verifications);

  if (latestVerification && shouldSyncGovernmentIdVerificationStatus(latestVerification.status)) {
    try {
      latestVerification = await syncGovernmentIdVerificationFromPersona({
        verification: latestVerification,
        correlationId: args.correlationId,
      });
      evidenceRecords = await listCareerIdEvidence({
        careerIdentityId: args.careerIdentityId,
      });
    } catch {
      // Fall back to persisted state when Persona is temporarily unavailable.
    }
  }

  let governmentEvidence = getGovernmentIdEvidence(evidenceRecords);

  if (latestVerification) {
    const staleReset = await autoResetStaleInProgressGovernmentVerification({
      verification: latestVerification,
      evidence: governmentEvidence,
      correlationId: args.correlationId,
    });
    latestVerification = staleReset.verification;
    governmentEvidence = staleReset.evidence;
  }

  const documentUnlocked = true;
  const documentStatus = computeDocumentVerificationStatus({
    evidence: governmentEvidence,
    latestVerification,
    unlocked: documentUnlocked,
  });
  const phases = args.phaseProgress.map((progress) => {
    const phaseKey = phaseToTrustLayer(progress.phase);
    const unlocked =
      progress.phase === "self" || progress.phase === "document"
        ? true
        : progress.isCurrent || progress.isComplete;
    const documentCompletedBonus =
      phaseKey === "document_backed" && governmentEvidence?.status === "verified" ? 1 : 0;
    const completedCount = progress.completed + documentCompletedBonus;
    const totalCount = progress.total + (phaseKey === "document_backed" ? 1 : 0);
    const status = derivePhaseStatus({
      phase: phaseKey,
      progress,
      unlocked,
      evidenceStatus: phaseKey === "document_backed" ? documentStatus : null,
      completedCount,
    });
    const evidence =
      phaseKey === "document_backed" && governmentEvidence
        ? [toGovernmentIdEvidenceItem(governmentEvidence, latestVerification)]
        : [];

    return {
      key: phaseKey,
      title: trustLayerTitleByPhase[phaseKey],
      description: trustLayerDescriptionByPhase[phaseKey],
      status,
      completedCount,
      totalCount,
      unlocked,
      evidence,
    };
  });
  const badges =
    governmentEvidence?.status === "verified"
      ? [
          {
            id: `badge_${governmentEvidence.id}`,
            label: "Government ID verified",
            phase: "document_backed" as const,
            status: "verified" as const,
          },
        ]
      : [];
  const result =
    latestVerification && governmentEvidence
      ? toGovernmentIdVerificationResult(latestVerification, governmentEvidence.id)
      : null;
  const profile: CareerIdProfile = {
    userId: args.careerIdentityId,
    phases,
    badges,
  };
  const documentVerification: CareerIdDocumentVerificationState = {
    evidenceId: governmentEvidence?.id ?? null,
    verificationId: latestVerification?.id ?? null,
    status: documentStatus,
    unlocked: documentUnlocked,
    estimatedTimeLabel: "About 2 minutes",
    explanation: GOVERNMENT_ID_EXPLANATION,
    helperText: computeDocumentHelperText(documentStatus, documentUnlocked),
    ctaLabel: computeDocumentCtaLabel(documentStatus, documentUnlocked),
    retryable: isRetryableStatus(documentStatus),
    artifactLabel: governmentEvidence?.status === "verified" ? "Government ID verified" : null,
    recoveryHints:
      (governmentEvidence?.metadata.recoveryHints as string[] | undefined) ??
      [...GOVERNMENT_ID_RECOVERY_HINTS],
    result,
  };

  return {
    careerIdProfile: profile,
    documentVerification,
  };
}

export async function createGovernmentIdVerificationSession(args: {
  correlationId: string;
  requestOrigin?: string | null;
  viewer: Viewer;
  input: {
    returnUrl: string;
    source: string;
  };
}) {
  const input = createGovernmentIdVerificationSessionInputSchema.parse(args.input);
  const identity = await resolveViewerIdentity({
    viewer: args.viewer,
    correlationId: args.correlationId,
  });
  assertGovernmentIdSessionAllowed(identity.careerIdentityId, args.correlationId);

  const [existingEvidenceRecords, existingVerifications] = await Promise.all([
    listCareerIdEvidence({
      careerIdentityId: identity.careerIdentityId,
    }),
    listCareerIdVerifications({
      careerIdentityId: identity.careerIdentityId,
    }),
  ]);
  let existingEvidence = getGovernmentIdEvidence(existingEvidenceRecords);
  let latestVerification = getLatestGovernmentIdVerification(existingVerifications);

  if (latestVerification) {
    const staleReset = await autoResetStaleInProgressGovernmentVerification({
      verification: latestVerification,
      evidence: existingEvidence,
      correlationId: args.correlationId,
    });
    latestVerification = staleReset.verification;
    existingEvidence = staleReset.evidence;
  }

  if (latestVerification?.status === "manual_review") {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "Your verification is already under manual review.",
      correlationId: args.correlationId,
    });
  }

  if (latestVerification?.status === "in_progress") {
    const providerReferenceId = decryptProviderReference(
      latestVerification.providerReferenceEncrypted,
    );
    const launchUrl = await generatePersonaOneTimeLink({
      inquiryId: providerReferenceId,
      correlationId: args.correlationId,
    }).catch(() =>
      buildPersonaHostedLaunchUrl({
        inquiryId: providerReferenceId,
        redirectUrl: buildAbsoluteReturnUrl({
          requestOrigin: args.requestOrigin,
          returnUrl: input.returnUrl,
          verificationId: latestVerification.id,
        }),
      }),
    );

    logAuditEvent({
      eventType: "persona_flow_started",
      actorType: "talent_user",
      actorId: identity.careerIdentityId,
      targetType: "career_id_verification",
      targetId: latestVerification.id,
      correlationId: args.correlationId,
      metadataJson: {
        source: input.source,
        resumed: true,
      },
    });

    return governmentIdVerificationSessionSchema.parse({
      ...toGovernmentIdVerificationResult(latestVerification, existingEvidence?.id ?? null),
      launchMethod: "redirect",
      launchUrl,
      expiresAt: null,
    });
  }

  const personaInquiry = await createPersonaInquiry({
    correlationId: args.correlationId,
    firstName: identity.firstName,
    lastName: identity.lastName,
    referenceId: identity.careerIdentityId,
    source: input.source,
  });
  const verificationId = `career_id_ver_${crypto.randomUUID()}`;
  const providerReferenceEncrypted = encryptProviderReference(personaInquiry.inquiryId);
  const providerReferenceHash = hashProviderReference(personaInquiry.inquiryId);
  const verification = await upsertCareerIdVerification({
    record: {
      id: verificationId,
      careerIdentityId: identity.careerIdentityId,
      phase: "document_backed",
      type: "government_id",
      provider: "persona",
      providerReferenceEncrypted,
      providerReferenceHash,
      status: "in_progress",
      confidenceBand: "medium",
      checks: defaultChecks(),
      manualReviewRequired: false,
      latestEventId: null,
      latestEventCreatedAt: null,
      latestPayloadHash: null,
      attemptNumber: (latestVerification?.attemptNumber ?? 0) + 1,
      source: input.source,
      completedAt: null,
    },
  });
  const evidence = await upsertGovernmentIdEvidence({
    careerIdentityId: identity.careerIdentityId,
    existingEvidenceId: existingEvidence?.id,
    providerReferenceEncrypted,
    providerReferenceHash,
    recoveryHints: [...GOVERNMENT_ID_RECOVERY_HINTS],
    verificationId,
    result: {
      checks: defaultChecks(),
      completedAt: null,
      confidenceBand: "medium",
      metadata: {
        source: input.source,
      },
      status: "in_progress",
    },
  });
  const launchUrl = buildPersonaHostedLaunchUrl({
    inquiryId: personaInquiry.inquiryId,
    redirectUrl: buildAbsoluteReturnUrl({
      requestOrigin: args.requestOrigin,
      returnUrl: input.returnUrl,
      verificationId: verification.id,
    }),
  });

  logAuditEvent({
    eventType: "verification_session_created",
    actorType: "talent_user",
    actorId: identity.careerIdentityId,
    targetType: "career_id_verification",
    targetId: verification.id,
    correlationId: args.correlationId,
    metadataJson: {
      attemptNumber: verification.attemptNumber,
      source: input.source,
    },
  });
  logAuditEvent({
    eventType: "persona_flow_started",
    actorType: "talent_user",
    actorId: identity.careerIdentityId,
    targetType: "career_id_verification",
    targetId: verification.id,
    correlationId: args.correlationId,
    metadataJson: {
      source: input.source,
      resumed: false,
    },
  });

  return governmentIdVerificationSessionSchema.parse({
    ...toGovernmentIdVerificationResult(verification, evidence.id),
    launchMethod: "redirect",
    launchUrl,
    expiresAt: personaInquiry.expiresAt,
  });
}

export async function getGovernmentIdVerificationStatus(args: {
  correlationId: string;
  verificationId: string;
  viewer: Viewer;
}) {
  const identity = await resolveViewerIdentity({
    viewer: args.viewer,
    correlationId: args.correlationId,
  });
  let verification = ensureVerificationOwnership(
    await getCareerIdVerificationById({
      verificationId: args.verificationId,
    }),
    identity.careerIdentityId,
    args.correlationId,
  );

  if (shouldSyncGovernmentIdVerificationStatus(verification.status)) {
    try {
      verification = await syncGovernmentIdVerificationFromPersona({
        verification,
        correlationId: args.correlationId,
      });
    } catch {
      // Fall back to the persisted state when Persona is temporarily unavailable.
    }
  }

  let evidence = getGovernmentIdEvidence(
    await listCareerIdEvidence({
      careerIdentityId: identity.careerIdentityId,
    }),
  );

  const staleReset = await autoResetStaleInProgressGovernmentVerification({
    verification,
    evidence,
    correlationId: args.correlationId,
  });
  verification = staleReset.verification ?? verification;
  evidence = staleReset.evidence;

  return toGovernmentIdVerificationResult(verification, evidence?.id ?? null);
}

export async function resetGovernmentIdVerificationState(args: {
  correlationId: string;
  viewer: Viewer;
}) {
  const identity = await resolveViewerIdentity({
    viewer: args.viewer,
    correlationId: args.correlationId,
  });
  const result = await resetCareerIdGovernmentVerificationState({
    careerIdentityId: identity.careerIdentityId,
  });

  getGovernmentIdSessionRateLimitStore().delete(identity.careerIdentityId);
  logAuditEvent({
    eventType: "verification_state_reset",
    actorType: "talent_user",
    actorId: identity.careerIdentityId,
    targetType: "career_identity",
    targetId: identity.careerIdentityId,
    correlationId: args.correlationId,
    metadataJson: {
      ...result,
      phase: "document_backed",
      verificationType: "government_id",
    },
  });

  return {
    careerIdentityId: identity.careerIdentityId,
    reset: true,
    ...result,
  };
}

export async function retryGovernmentIdEvidence(args: {
  correlationId: string;
  evidenceId: string;
  input: {
    returnUrl: string;
    source: string;
  };
  requestOrigin?: string | null;
  viewer: Viewer;
}) {
  const identity = await resolveViewerIdentity({
    viewer: args.viewer,
    correlationId: args.correlationId,
  });
  const evidence = await getCareerIdEvidenceById({
    evidenceId: args.evidenceId,
  });

  if (!evidence || evidence.careerIdentityId !== identity.careerIdentityId) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Career ID evidence was not found.",
      correlationId: args.correlationId,
    });
  }

  if (!isRetryableStatus(evidence.status)) {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "This evidence is not currently retryable.",
      correlationId: args.correlationId,
    });
  }

  return createGovernmentIdVerificationSession(args);
}

function computePayloadHash(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

function safeHexCompare(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function verifyPersonaWebhookSignature(args: {
  correlationId: string;
  rawBody: string;
  signatureHeader: string | null;
}) {
  const secret = getPersonaWebhookSecret();

  if (!secret) {
    throw new ApiError({
      errorCode: "DEPENDENCY_FAILURE",
      status: 503,
      message: "Persona webhook secret is not configured.",
      correlationId: args.correlationId,
    });
  }

  const signatureHeader = args.signatureHeader?.trim();

  if (!signatureHeader) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "Missing Persona webhook signature.",
      correlationId: args.correlationId,
    });
  }

  const groups = signatureHeader.split(/\s+/).filter(Boolean);
  const maxAgeSeconds = Number(process.env.PERSONA_WEBHOOK_MAX_AGE_SECONDS ?? "300");
  let valid = false;

  for (const group of groups) {
    const entries = Object.fromEntries(
      group
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [key, value] = part.split("=");
          return [key, value];
        }),
    );
    const timestamp = entries.t;
    const signature = entries.v1;

    if (!timestamp || !signature) {
      continue;
    }

    const ageSeconds = Math.abs(Date.now() - Number(timestamp) * 1000) / 1000;

    if (Number.isFinite(ageSeconds) && ageSeconds > maxAgeSeconds) {
      continue;
    }

    const computed = createHmac("sha256", secret)
      .update(`${timestamp}.${args.rawBody}`)
      .digest("hex");

    if (safeHexCompare(computed, signature)) {
      valid = true;
      break;
    }
  }

  if (!valid) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "Persona webhook signature verification failed.",
      correlationId: args.correlationId,
    });
  }
}

export async function handlePersonaWebhook(args: {
  correlationId: string;
  rawBody: string;
  signatureHeader: string | null;
}) {
  verifyPersonaWebhookSignature(args);
  const payloadHash = computePayloadHash(args.rawBody);
  const webhook = JSON.parse(args.rawBody) as PersonaWebhookEnvelope;
  const providerEventId = webhook.data?.id?.trim() ?? null;
  const eventName = webhook.data?.attributes?.name?.trim() ?? null;
  const eventCreatedAt = webhook.data?.attributes?.["created-at"]?.trim() ?? null;
  const inquiryFromPayload = webhook.data?.attributes?.payload?.data;
  const inquiryId = inquiryFromPayload?.id?.trim();

  if (!providerEventId || !eventName || !inquiryId) {
    throw new ApiError({
      errorCode: "VALIDATION_FAILED",
      status: 422,
      message: "Persona webhook payload is missing required inquiry metadata.",
      correlationId: args.correlationId,
    });
  }

  const existingProviderEvent = await getCareerIdAuditEventByProviderEvent({
    provider: "persona",
    providerEventId,
  });

  if (existingProviderEvent) {
    return {
      duplicate: true,
      processed: false,
      providerEventId,
    };
  }

  const verification = await findCareerIdVerificationByProviderReferenceHash({
    providerReferenceHash: hashProviderReference(inquiryId),
  });

  if (!verification) {
    return {
      ignored: true,
      processed: false,
      providerEventId,
    };
  }

  await createCareerIdAuditEvent({
    id: `career_id_audit_${crypto.randomUUID()}`,
    careerIdentityId: verification.careerIdentityId,
    verificationId: verification.id,
    eventType: "persona_webhook_received",
    provider: "persona",
    providerEventId,
    payloadHash,
    metadata: {
      eventName,
      eventCreatedAt,
    },
  });

  if (
    verification.latestEventCreatedAt &&
    eventCreatedAt &&
    new Date(eventCreatedAt).getTime() < new Date(verification.latestEventCreatedAt).getTime()
  ) {
    return {
      processed: false,
      providerEventId,
      stale: true,
      verificationId: verification.id,
    };
  }

  let inquiry = inquiryFromPayload as PersonaInquiryResource;

  try {
    inquiry = await retrievePersonaInquiry({
      correlationId: args.correlationId,
      inquiryId,
    });
  } catch {
    inquiry = inquiryFromPayload as PersonaInquiryResource;
  }

  const normalized = normalizePersonaInquiry({
    eventName,
    inquiry,
  });
  const updatedVerification = await upsertCareerIdVerification({
    record: {
      ...verification,
      providerReferenceEncrypted: verification.providerReferenceEncrypted,
      providerReferenceHash: verification.providerReferenceHash,
      status: normalized.status,
      confidenceBand: normalized.confidenceBand ?? null,
      checks: normalized.checks,
      manualReviewRequired: normalized.status === "manual_review",
      latestEventId: providerEventId,
      latestEventCreatedAt: eventCreatedAt,
      latestPayloadHash: payloadHash,
      completedAt: normalized.completedAt,
      updatedAt: new Date().toISOString(),
    },
  });
  const existingEvidence = getGovernmentIdEvidence(
    await listCareerIdEvidence({
      careerIdentityId: verification.careerIdentityId,
    }),
  );
  await upsertGovernmentIdEvidence({
    careerIdentityId: verification.careerIdentityId,
    existingEvidenceId: existingEvidence?.id,
    providerReferenceEncrypted: verification.providerReferenceEncrypted,
    providerReferenceHash: verification.providerReferenceHash,
    recoveryHints: normalized.recoveryHints,
    verificationId: verification.id,
    result: normalized,
  });

  logAuditEvent({
    eventType: "persona_webhook_received",
    actorType: "system_service",
    actorId: "persona_webhook",
    targetType: "career_id_verification",
    targetId: verification.id,
    correlationId: args.correlationId,
    metadataJson: {
      eventName,
      providerEventId,
    },
  });
  logAuditEvent({
    eventType: "verification_normalized",
    actorType: "system_service",
    actorId: "persona_webhook",
    targetType: "career_id_verification",
    targetId: verification.id,
    correlationId: args.correlationId,
    metadataJson: {
      normalizedStatus: normalized.status,
      providerEventId,
    },
  });
  logAuditEvent({
    eventType: "trust_phase_updated",
    actorType: "system_service",
    actorId: "persona_webhook",
    targetType: "career_id_verification",
    targetId: verification.id,
    correlationId: args.correlationId,
    metadataJson: {
      phase: "document_backed",
      status: normalized.status,
    },
  });

  if (verification.status !== "verified" && updatedVerification.status === "verified") {
    logAuditEvent({
      eventType: "badge_created",
      actorType: "system_service",
      actorId: "persona_webhook",
      targetType: "career_id_verification",
      targetId: verification.id,
      correlationId: args.correlationId,
      metadataJson: {
        badgeLabel: "Government ID verified",
      },
    });
  }

  return {
    processed: true,
    providerEventId,
    status: updatedVerification.status,
    verificationId: updatedVerification.id,
  };
}

export function resetGovernmentIdSessionRateLimitStore() {
  globalThis.__careerIdGovernmentIdSessionRateLimit = new Map();
}
