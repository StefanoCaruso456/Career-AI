import type { AuditEvent, ActorType } from "@/packages/contracts/src";
import {
  countPersistedAuditEvents,
  createAuditEventRecord,
  isDatabaseConfigured,
} from "@/packages/persistence/src";

declare global {
  // eslint-disable-next-line no-var
  var __taidAuditEventWriteQueue: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __taidAuditEvents: AuditEvent[] | undefined;
}

const redactedPlaceholder = "[REDACTED]";
const sensitiveMetadataKeyPattern =
  /authorization|cookie|password|secret|session|signature|token/i;

function getAuditEvents(): AuditEvent[] {
  if (!globalThis.__taidAuditEvents) {
    globalThis.__taidAuditEvents = [];
  }

  return globalThis.__taidAuditEvents;
}

function getAuditEventWriteQueue() {
  if (!globalThis.__taidAuditEventWriteQueue) {
    globalThis.__taidAuditEventWriteQueue = Promise.resolve();
  }

  return globalThis.__taidAuditEventWriteQueue;
}

function shouldPersistAuditEvents() {
  if (!isDatabaseConfigured()) {
    return false;
  }

  const configuredValue = process.env.DURABLE_AUDIT_LOGGING?.trim();

  if (configuredValue === "0" || configuredValue === "false") {
    return false;
  }

  if (process.env.NODE_ENV === "test" && !configuredValue) {
    return false;
  }

  return true;
}

function redactAuditMetadataValue(value: unknown, depth = 0): unknown {
  if (depth >= 6) {
    return "[TRUNCATED]";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactAuditMetadataValue(entry, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
      if (sensitiveMetadataKeyPattern.test(key)) {
        return [key, redactedPlaceholder];
      }

      return [key, redactAuditMetadataValue(entryValue, depth + 1)];
    }),
  );
}

export function redactAuditMetadata(metadataJson?: Record<string, unknown>) {
  if (!metadataJson) {
    return {};
  }

  return redactAuditMetadataValue(metadataJson) as Record<string, unknown>;
}

function queueAuditEventPersistence(event: AuditEvent) {
  if (!shouldPersistAuditEvents()) {
    return;
  }

  globalThis.__taidAuditEventWriteQueue = getAuditEventWriteQueue().then(async () => {
    try {
      await createAuditEventRecord({ event });
    } catch (error) {
      console.error("Failed to persist audit event.", error);
    }
  });
}

export function logAuditEvent(args: {
  correlationId: string;
  actorId: string;
  actorType: ActorType;
  eventType: string;
  metadataJson?: Record<string, unknown>;
  runId?: string | null;
  targetId: string;
  targetType: string;
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
    metadata_json: redactAuditMetadata(args.metadataJson),
    run_id: args.runId ?? null,
  };

  getAuditEvents().push(event);
  queueAuditEventPersistence(event);

  return event;
}

export async function flushAuditEventWrites() {
  await getAuditEventWriteQueue();
}

export async function getAuditEventCount() {
  if (!shouldPersistAuditEvents()) {
    return listAuditEvents().length;
  }

  try {
    await flushAuditEventWrites();
    return await countPersistedAuditEvents();
  } catch (error) {
    console.error("Failed to read persisted audit event count.", error);
    return listAuditEvents().length;
  }
}

export function listAuditEvents(): AuditEvent[] {
  return [...getAuditEvents()];
}

export function resetAuditStore() {
  globalThis.__taidAuditEvents = [];
  globalThis.__taidAuditEventWriteQueue = Promise.resolve();
}
