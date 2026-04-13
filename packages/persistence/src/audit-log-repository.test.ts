import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  countPersistedAuditEvents,
  createAuditEventRecord,
  listPersistedAuditEvents,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("audit log repository", () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://career-ai:test@localhost:5432/career_ai_test";
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    delete process.env.DATABASE_URL;
    await resetTestDatabase();
  });

  it("persists audit events with a nullable run id", async () => {
    await createAuditEventRecord({
      event: {
        actor_id: "user:tal_123",
        actor_type: "talent_user",
        correlation_id: "corr-123",
        event_id: "evt-123",
        event_type: "user.preference.persona.updated",
        metadata_json: {
          preferred_persona: "employer",
        },
        occurred_at: "2026-04-12T00:00:00.000Z",
        run_id: null,
        target_id: "user_123",
        target_type: "user",
      },
    });

    await expect(countPersistedAuditEvents()).resolves.toBe(1);
    await expect(listPersistedAuditEvents()).resolves.toEqual([
      {
        actor_id: "user:tal_123",
        actor_type: "talent_user",
        correlation_id: "corr-123",
        event_id: "evt-123",
        event_type: "user.preference.persona.updated",
        metadata_json: {
          preferred_persona: "employer",
        },
        occurred_at: "2026-04-12T00:00:00.000Z",
        run_id: null,
        target_id: "user_123",
        target_type: "user",
      },
    ]);
  });
});
