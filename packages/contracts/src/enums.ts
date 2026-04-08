import { z } from "zod";

export const verificationStatuses = [
  "NOT_SUBMITTED",
  "SUBMITTED",
  "PARSING",
  "PARSED",
  "PENDING_REVIEW",
  "PARTIALLY_VERIFIED",
  "REVIEWED",
  "SOURCE_VERIFIED",
  "MULTI_SOURCE_VERIFIED",
  "REJECTED",
  "EXPIRED",
  "NEEDS_RESUBMISSION",
] as const;

export const verificationConfidenceTiers = [
  "SELF_REPORTED",
  "EVIDENCE_SUBMITTED",
  "REVIEWED",
  "SOURCE_CONFIRMED",
  "MULTI_SOURCE_CONFIRMED",
] as const;

export const verificationMethods = [
  "USER_UPLOAD",
  "INTERNAL_REVIEW",
  "EMPLOYER_AGENT",
  "INSTITUTION_AGENT",
  "AUTHORIZED_HUMAN",
  "PUBLIC_REGISTRY",
  "ENDORSEMENT_SUBMISSION",
  "SYSTEM_RULE_MATCH",
] as const;

export const actorTypes = [
  "talent_user",
  "recruiter_user",
  "hiring_manager_user",
  "reviewer_admin",
  "system_service",
] as const;

export const errorCodes = [
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "DEPENDENCY_FAILURE",
] as const;

export const verificationStatusSchema = z.enum(verificationStatuses);
export const verificationConfidenceTierSchema = z.enum(verificationConfidenceTiers);
export const verificationMethodSchema = z.enum(verificationMethods);
export const actorTypeSchema = z.enum(actorTypes);
export const errorCodeSchema = z.enum(errorCodes);

export type VerificationStatus = (typeof verificationStatuses)[number];
export type VerificationConfidenceTier = (typeof verificationConfidenceTiers)[number];
export type VerificationMethod = (typeof verificationMethods)[number];
export type ActorType = (typeof actorTypes)[number];
export type ErrorCode = (typeof errorCodes)[number];
