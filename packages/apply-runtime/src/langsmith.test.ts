import { describe, expect, it } from "vitest";
import { buildApplyRunnableConfig } from "./langsmith";

describe("buildApplyRunnableConfig", () => {
  it("propagates trace_id metadata and tags for cross-system correlation", () => {
    const config = buildApplyRunnableConfig({
      adapterId: "workday_primary",
      atsFamily: "workday",
      companyName: "Workday",
      failureCode: null,
      graphVersion: "2026-04-17",
      jobId: "job_123",
      jobTitle: "Product Designer",
      profileSnapshotId: "profile_snapshot_123",
      runId: "apply_run_123",
      terminalState: null,
      traceId: "apply_trace_123",
      userId: "user_123",
    });

    expect(config.metadata).toMatchObject({
      runId: "apply_run_123",
      traceId: "apply_trace_123",
    });
    expect(config.tags).toContain("trace:apply_trace_123");
    expect(config.tags).toContain("run:apply_run_123");
  });
});
