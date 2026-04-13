import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushAuditEventWrites,
  listAuditEvents,
  logAuditEvent,
  redactAuditMetadata,
  resetAuditStore,
} from "@/packages/audit-security/src";
import { countPersistedAuditEvents, setDatabasePoolForTests } from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("audit store", () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://career-ai:test@localhost:5432/career_ai_test";
    process.env.DURABLE_AUDIT_LOGGING = "1";
    await resetTestDatabase();
    await installTestDatabase();
    resetAuditStore();
  });

  afterEach(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DURABLE_AUDIT_LOGGING;
    resetAuditStore();
    await resetTestDatabase();
  });

  it("redacts sensitive metadata before storing audit events", async () => {
    logAuditEvent({
      actorId: "user:tal_123",
      actorType: "talent_user",
      correlationId: "corr-redact",
      eventType: "candidate.privacy_settings.updated",
      metadataJson: {
        accessToken: "secret-token",
        nested: {
          authorizationHeader: "Bearer top-secret",
        },
      },
      targetId: "tal_123",
      targetType: "talent_identity",
    });

    await flushAuditEventWrites();

    expect(listAuditEvents()[0]?.metadata_json).toEqual({
      accessToken: "[REDACTED]",
      nested: {
        authorizationHeader: "[REDACTED]",
      },
    });
    await expect(countPersistedAuditEvents()).resolves.toBe(1);
  });

  it("keeps app flows alive when durable persistence fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    setDatabasePoolForTests({
      connect: async () => {
        throw new Error("connect failed");
      },
      end: async () => undefined,
      query: async () => {
        throw new Error("query failed");
      },
    });

    const event = logAuditEvent({
      actorId: "user:tal_456",
      actorType: "talent_user",
      correlationId: "corr-failure",
      eventType: "candidate.privacy_settings.updated",
      metadataJson: {
        sessionCookie: "signed-cookie",
      },
      targetId: "tal_456",
      targetType: "talent_identity",
    });

    await expect(flushAuditEventWrites()).resolves.toBeUndefined();
    expect(event.metadata_json).toEqual({
      sessionCookie: "[REDACTED]",
    });
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("exports the metadata redaction helper for direct callers", () => {
    expect(
      redactAuditMetadata({
        apiSecret: "super-secret",
        safeValue: "visible",
      }),
    ).toEqual({
      apiSecret: "[REDACTED]",
      safeValue: "visible",
    });
  });
});
