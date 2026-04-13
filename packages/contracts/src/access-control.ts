import { z } from "zod";
import { actorTypeSchema } from "./enums";

export const organizationMembershipRoleSchema = z.enum(["owner", "admin", "member"]);
export const organizationMembershipStatusSchema = z.enum(["active", "inactive"]);
export const accessScopeSchema = z.enum(["candidate_private_profile"]);
export const accessRequestStatusSchema = z.enum([
  "pending",
  "granted",
  "rejected",
  "cancelled",
]);
export const accessGrantStatusSchema = z.enum(["active", "revoked"]);

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const organizationMembershipSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  role: organizationMembershipRoleSchema,
  status: organizationMembershipStatusSchema,
  userId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const accessRequestSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  requesterUserId: z.string(),
  subjectTalentIdentityId: z.string(),
  scope: accessScopeSchema,
  justification: z.string(),
  status: accessRequestStatusSchema,
  grantedByActorId: z.string().nullable(),
  grantedByActorType: actorTypeSchema.nullable(),
  grantedAt: z.string().datetime().nullable(),
  rejectedByActorId: z.string().nullable(),
  rejectedByActorType: actorTypeSchema.nullable(),
  rejectedAt: z.string().datetime().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const accessGrantSchema = z.object({
  id: z.string(),
  accessRequestId: z.string().nullable(),
  organizationId: z.string(),
  subjectTalentIdentityId: z.string(),
  scope: accessScopeSchema,
  status: accessGrantStatusSchema,
  grantedByActorId: z.string(),
  grantedByActorType: actorTypeSchema,
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createAccessRequestInputSchema = z.object({
  organizationId: z.string().trim().min(1).nullable().optional().default(null),
  scope: accessScopeSchema.default("candidate_private_profile"),
  subjectTalentIdentityId: z.string().trim().min(1),
  justification: z.string().trim().min(1).max(1000),
});

export const resolveAccessRequestInputSchema = z.object({
  expiresAtOptional: z.string().datetime().nullable().optional().default(null),
  note: z.string().trim().max(1000).nullable().optional().default(null),
});

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationMembership = z.infer<typeof organizationMembershipSchema>;
export type OrganizationMembershipRole = z.infer<typeof organizationMembershipRoleSchema>;
export type OrganizationMembershipStatus = z.infer<typeof organizationMembershipStatusSchema>;
export type AccessScope = z.infer<typeof accessScopeSchema>;
export type AccessRequestStatus = z.infer<typeof accessRequestStatusSchema>;
export type AccessGrantStatus = z.infer<typeof accessGrantStatusSchema>;
export type AccessRequest = z.infer<typeof accessRequestSchema>;
export type AccessGrant = z.infer<typeof accessGrantSchema>;
export type CreateAccessRequestInput = z.infer<typeof createAccessRequestInputSchema>;
export type ResolveAccessRequestInput = z.infer<typeof resolveAccessRequestInputSchema>;
