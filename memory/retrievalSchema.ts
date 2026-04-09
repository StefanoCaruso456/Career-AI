import { z } from "zod";
import { memoryScopeValues, memorySourceKindValues } from "./memoryTypes";

export const retrievedMemorySchema = z.object({
  id: z.string().min(1),
  layer: z.enum(["instruction", "semantic", "repo"]),
  scope: z.union([z.enum(memoryScopeValues), z.literal("global")]),
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  score: z.number().min(0),
  source: z.object({
    kind: z.union([z.enum(memorySourceKindValues), z.literal("instruction")]),
    reference: z.string().min(1),
  }),
  why_retrieved: z.array(z.string()),
  authoritative: z.boolean(),
});

export const retrievalTraceSchema = z.object({
  query: z.string().min(1),
  scopes: z.array(z.enum(memoryScopeValues)),
  retrieved_at: z.string().datetime({ offset: true }),
  authority_notes: z.array(z.string()),
  layers: z.array(
    z.object({
      layer: z.enum(["instruction", "semantic", "repo"]),
      considered_count: z.number().int().nonnegative(),
      returned_count: z.number().int().nonnegative(),
      results: z.array(retrievedMemorySchema),
    }),
  ),
  context_package: z.array(retrievedMemorySchema),
});
