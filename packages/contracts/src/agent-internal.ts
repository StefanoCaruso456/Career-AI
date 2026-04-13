import { z } from "zod";
import {
  w3cPresentationEnvelopeSchema,
  w3cPresentationSummarySchema,
} from "./presentation";

export const internalAgentRoleSchema = z.enum(["candidate", "recruiter", "verifier"]);
export const internalAgentMessageRoleSchema = z.enum(["assistant", "user"]);
export const internalAgentStopReasonSchema = z.enum([
  "completed",
  "empty_response",
  "max_steps_reached",
  "max_tool_calls_reached",
  "model_error",
  "overall_timeout",
  "step_timeout",
  "tool_error",
]);

export const internalAgentMessageSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  role: internalAgentMessageRoleSchema,
});

const internalAgentRequestBaseSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  messages: z.array(internalAgentMessageSchema).max(20).default([]),
});

export const candidateAgentRequestSchema = internalAgentRequestBaseSchema.extend({
  talentIdentityId: z.string().trim().min(1),
});

export const recruiterAgentRequestSchema = internalAgentRequestBaseSchema.extend({
  organizationId: z.string().trim().min(1).nullable().optional().default(null),
  userId: z.string().trim().min(1),
});

export const verifierAgentRequestSchema = internalAgentRequestBaseSchema.extend({
  claimId: z.string().trim().min(1).nullable().optional().default(null),
  presentation: w3cPresentationEnvelopeSchema.nullable().optional().default(null),
  subjectTalentIdentityId: z.string().trim().min(1).nullable().optional().default(null),
  verificationRecordId: z.string().trim().min(1).nullable().optional().default(null),
});

export const internalAgentResponseSchema = z.object({
  presentationSummary: w3cPresentationSummarySchema.nullable().optional().default(null),
  reply: z.string(),
  role: internalAgentRoleSchema,
  runId: z.string().trim().min(1),
  stepsUsed: z.number().int().nonnegative(),
  stopReason: internalAgentStopReasonSchema,
  toolCallsUsed: z.number().int().nonnegative(),
});

export type InternalAgentRole = z.infer<typeof internalAgentRoleSchema>;
export type InternalAgentMessage = z.infer<typeof internalAgentMessageSchema>;
export type InternalAgentStopReason = z.infer<typeof internalAgentStopReasonSchema>;
export type CandidateAgentRequest = z.infer<typeof candidateAgentRequestSchema>;
export type RecruiterAgentRequest = z.infer<typeof recruiterAgentRequestSchema>;
export type VerifierAgentRequest = z.infer<typeof verifierAgentRequestSchema>;
export type InternalAgentResponse = z.infer<typeof internalAgentResponseSchema>;
