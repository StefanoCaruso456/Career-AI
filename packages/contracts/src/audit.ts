import { z } from "zod";
import { actorTypeSchema } from "./enums";

export const auditEventSchema = z.object({
  event_id: z.string(),
  event_type: z.string(),
  actor_type: actorTypeSchema,
  actor_id: z.string(),
  target_type: z.string(),
  target_id: z.string(),
  correlation_id: z.string(),
  run_id: z.string().nullable().optional(),
  occurred_at: z.string().datetime(),
  metadata_json: z.record(z.string(), z.unknown()),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
