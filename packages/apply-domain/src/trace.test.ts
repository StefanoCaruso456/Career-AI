import { describe, expect, it, vi } from "vitest";
import type { ApplyRunDto, ApplyRunEventDto } from "@/packages/contracts/src";
import {
  buildApplyRunTraceTree,
  createApplyTraceLogRecord,
  emitApplyTraceLog,
  resolveApplyTracePhase,
} from "./trace";

function createRun(): Pick<
  ApplyRunDto,
  "companyName" | "completedAt" | "createdAt" | "id" | "jobTitle" | "status" | "traceId"
> {
  return {
    companyName: "Accenture",
    completedAt: "2026-04-20T15:06:00.000Z",
    createdAt: "2026-04-20T15:00:00.000Z",
    id: "apply_run_123",
    jobTitle: "Senior Product Designer",
    status: "submitted",
    traceId: "apply_trace_123",
  };
}

function createEvents(): ApplyRunEventDto[] {
  return [
    {
      eventType: "apply_run.created",
      id: "apply_event_1",
      message: "Apply run created and queued.",
      metadataJson: {},
      runId: "apply_run_123",
      state: "queued",
      stepName: "start_apply_run",
      timestamp: "2026-04-20T15:00:00.000Z",
      traceId: "apply_trace_123",
    },
    {
      eventType: "apply_run.resolve_target_node",
      id: "apply_event_2",
      message: "ATS target resolved as workday.",
      metadataJson: {
        confidence: 0.99,
      },
      runId: "apply_run_123",
      state: "detecting_target",
      stepName: "resolve_target_node",
      timestamp: "2026-04-20T15:01:00.000Z",
      traceId: "apply_trace_123",
    },
    {
      eventType: "apply_run.submit_application_node",
      id: "apply_event_3",
      message: "Submit action executed.",
      metadataJson: {},
      runId: "apply_run_123",
      state: "submitting",
      stepName: "submit_application_node",
      timestamp: "2026-04-20T15:03:00.000Z",
      traceId: "apply_trace_123",
    },
    {
      eventType: "apply_run.finalize_success_node",
      id: "apply_event_4",
      message: "Application submitted successfully.",
      metadataJson: {},
      runId: "apply_run_123",
      state: "submitted",
      stepName: "finalize_success_node",
      timestamp: "2026-04-20T15:05:00.000Z",
      traceId: "apply_trace_123",
    },
  ];
}

describe("apply trace helpers", () => {
  it("builds a root run node with grouped phase children", () => {
    const traceTree = buildApplyRunTraceTree({
      events: createEvents(),
      run: createRun(),
    });

    expect(traceTree.version).toBe("career_ai.apply_trace_tree.v1");
    expect(traceTree.root).toMatchObject({
      id: "apply_run_123",
      kind: "run",
      metadataJson: {
        phaseCount: 4,
        stepCount: 4,
      },
      status: "submitted",
      traceId: "apply_trace_123",
    });
    expect(traceTree.root.children.map((node) => node.phase)).toEqual([
      "queue",
      "target_resolution",
      "submission",
      "completion",
    ]);
    expect(traceTree.root.children[0]?.children[0]).toMatchObject({
      eventType: "apply_run.created",
      kind: "step",
      name: "Create queued apply run",
      phase: "queue",
      stepName: "start_apply_run",
    });
  });

  it("creates structured trace logs that are safe to emit to runtime logs", () => {
    const record = createApplyTraceLogRecord({
      companyName: "Accenture",
      correlationId: "corr_123",
      eventType: "apply_click.routing_decision",
      jobId: "job_123",
      jobTitle: "Senior Product Designer",
      kind: "step",
      message: "Autonomous apply click routing evaluated.",
      metadataJson: {
        routingAction: "queue_autonomous_apply",
      },
      name: "Evaluate apply click routing",
      phase: "routing",
      spanId: "apply_click:job_123:corr_123",
      status: "queue_autonomous_apply",
    });

    expect(record).toMatchObject({
      companyName: "Accenture",
      correlationId: "corr_123",
      jobId: "job_123",
      schema: "career_ai.apply_trace_log.v1",
      span: {
        kind: "step",
        phase: "routing",
      },
    });
  });

  it("emits structured trace logs as JSON", () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    emitApplyTraceLog({
      companyName: "Accenture",
      jobId: "job_123",
      jobTitle: "Senior Product Designer",
      kind: "step",
      message: "Worker claimed queued apply run.",
      name: "Worker claimed run",
      phase: "queue",
      runId: "apply_run_123",
      spanId: "apply_event_worker_claimed",
      status: "preflight_validating",
      traceId: "apply_trace_123",
    });

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(consoleInfoSpy.mock.calls[0]?.[0]))).toMatchObject({
      runId: "apply_run_123",
      schema: "career_ai.apply_trace_log.v1",
      span: {
        phase: "queue",
        status: "preflight_validating",
      },
      traceId: "apply_trace_123",
    });

    consoleInfoSpy.mockRestore();
  });

  it("maps known step names into stable lifecycle phases", () => {
    expect(
      resolveApplyTracePhase({
        stepName: "submit_application_node",
      }),
    ).toBe("submission");
    expect(
      resolveApplyTracePhase({
        stepName: "runtime_error",
      }),
    ).toBe("failure_handling");
  });
});
