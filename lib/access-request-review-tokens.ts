import { createHash, randomBytes } from "node:crypto";
import { getPublicBaseUrl } from "@/auth-config";

const DEFAULT_REVIEW_TOKEN_TTL_MINUTES = 60 * 24 * 3;

export function getAccessRequestReviewTokenTtlMinutes() {
  const configuredValue = Number(process.env.ACCESS_REQUEST_REVIEW_TOKEN_TTL_MINUTES ?? "");

  if (Number.isFinite(configuredValue) && configuredValue > 0) {
    return configuredValue;
  }

  return DEFAULT_REVIEW_TOKEN_TTL_MINUTES;
}

export function createAccessRequestReviewToken() {
  return randomBytes(24).toString("base64url");
}

export function hashAccessRequestReviewToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getAccessRequestReviewTokenExpiry(now = new Date()) {
  return new Date(now.getTime() + getAccessRequestReviewTokenTtlMinutes() * 60 * 1000).toISOString();
}

export function buildAccessRequestReviewPath(args: {
  requestId: string;
  token?: string | null;
}) {
  const path = `/access-requests/${args.requestId}`;

  if (!args.token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(args.token)}`;
}

export function buildAccessRequestReviewUrl(args: {
  requestId: string;
  token: string;
}) {
  const baseUrl = getPublicBaseUrl();

  if (!baseUrl) {
    return null;
  }

  return new URL(buildAccessRequestReviewPath(args), baseUrl).toString();
}
