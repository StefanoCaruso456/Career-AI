import { z } from "zod";

export const w3cPresentationEnvelopeSchema = z.object({
  challenge: z.string().trim().min(1).nullable().optional().default(null),
  definitionId: z.string().trim().min(1).nullable().optional().default(null),
  descriptorIds: z.array(z.string().trim().min(1)).max(32).default([]),
  format: z.string().trim().min(1).nullable().optional().default(null),
  holderDid: z.string().trim().min(1).nullable().optional().default(null),
  presentation: z.record(z.string(), z.unknown()).nullable().optional().default(null),
});

export const w3cPresentationSummarySchema = z.object({
  challenge: z.string().nullable(),
  definitionId: z.string().nullable(),
  descriptorIds: z.array(z.string()),
  format: z.string().nullable(),
  hasPresentation: z.boolean(),
  holderDid: z.string().nullable(),
});

export type W3CPresentationEnvelope = z.infer<typeof w3cPresentationEnvelopeSchema>;
export type W3CPresentationSummary = z.infer<typeof w3cPresentationSummarySchema>;
