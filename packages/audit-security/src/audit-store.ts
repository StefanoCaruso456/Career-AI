import type { AuditEvent, ActorType } from "@/packages/contracts/src";

declare global {
  // eslint-disable-next-line no-var
  var __taidAuditEvents: AuditEvent[] | undefined;
}

function getAuditEvents(): AuditEvent[] {
  if (!globalThis.__taidAuditEvents) {
    globalThis.__taidAuditEvents = [];
  }

  return globalThis.__taidAuditEvents;
}

export function logAuditEvent(args: {
  eventType: string;
  actorType: ActorType;
  actorId: string;
  targetType: string;
  targetId: string;
  correlationId: string;
  metadataJson?: Record<string, unknown>;
}): AuditEvent {
  const event: AuditEvent = {
    event_id: crypto.randomUUID(),
    event_type: args.eventType,
    actor_type: args.actorType,
    actor_id: args.actorId,
    target_type: args.targetType,
    target_id: args.targetId,
    correlation_id: args.correlationId,
    occurred_at: new Date().toISOString(),
    metadata_json: args.metadataJson ?? {},
  };

  getAuditEvents().push(event);

  return event;
}

export function listAuditEvents(): AuditEvent[] {
  return [...getAuditEvents()];
}

export function resetAuditStore() {
  globalThis.__taidAuditEvents = [];
}
