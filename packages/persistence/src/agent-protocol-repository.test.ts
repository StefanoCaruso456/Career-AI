import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgentTaskEventRecord,
  getAgentMessageRecordById,
  getAgentRunRecordById,
  listAgentHandoffsByParentRunId,
  listAgentTaskEventsByRequestId,
  upsertAgentHandoffRecord,
  upsertAgentMessageRecord,
  upsertAgentRunRecord,
} from "./agent-protocol-repository";
import { installTestDatabase, resetTestDatabase } from "./test-helpers";

describe("agent protocol repository", () => {
  beforeEach(async () => {
    await installTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("persists protocol message, run, handoff, and lifecycle event records", async () => {
    await upsertAgentMessageRecord({
      messageId: "msg_123",
      operation: "candidate_search",
      payloadJson: {
        prompt: "backend engineer",
      },
      protocolVersion: "a2a.v1",
      receiverAgentId: "careerai.agent.recruiter",
      requestId: "req_123",
      senderAgentId: "careerai.gateway.employer_search",
      sentAt: "2026-04-15T00:00:00.000Z",
      status: "accepted",
      taskType: "candidate_search",
      traceId: "trace_123",
    });

    await upsertAgentRunRecord({
      messageId: "msg_123",
      receiverAgentId: "careerai.gateway.employer_search",
      requestId: "req_123",
      runId: "run_parent",
      senderAgentId: "careerai.gateway.employer_search",
      startedAt: "2026-04-15T00:00:00.000Z",
      status: "accepted",
      traceId: "trace_123",
    });

    await upsertAgentRunRecord({
      messageId: "msg_123",
      parentRunId: "run_parent",
      receiverAgentId: "careerai.agent.recruiter",
      requestId: "req_123",
      runId: "run_child",
      senderAgentId: "careerai.gateway.employer_search",
      startedAt: "2026-04-15T00:00:00.000Z",
      status: "accepted",
      traceId: "trace_123",
    });

    await upsertAgentHandoffRecord({
      childRunId: "run_child",
      handoffId: "handoff_123",
      handoffType: "external_a2a_dispatch",
      messageId: "msg_123",
      parentRunId: "run_parent",
      receiverAgentId: "careerai.agent.recruiter",
      requestId: "req_123",
      senderAgentId: "careerai.gateway.employer_search",
      sourceEndpoint: "/api/v1/employer/candidates/search",
      status: "accepted",
      targetEndpoint: "/api/a2a/agents/recruiter",
      traceId: "trace_123",
    });

    await createAgentTaskEventRecord({
      eventId: "evt_123",
      eventName: "a2a.message.received",
      messageId: "msg_123",
      parentRunId: "run_parent",
      receiverAgentId: "careerai.agent.recruiter",
      requestId: "req_123",
      runId: "run_child",
      senderAgentId: "careerai.gateway.employer_search",
      spanName: "a2a.message.received",
      status: "accepted",
      traceId: "trace_123",
    });

    await upsertAgentMessageRecord({
      completedAt: "2026-04-15T00:00:12.000Z",
      messageId: "msg_123",
      operation: "candidate_search",
      payloadJson: {
        prompt: "backend engineer",
      },
      protocolVersion: "a2a.v1",
      receiverAgentId: "careerai.agent.recruiter",
      requestId: "req_123",
      senderAgentId: "careerai.gateway.employer_search",
      sentAt: "2026-04-15T00:00:00.000Z",
      status: "completed",
      taskType: "candidate_search",
      traceId: "trace_123",
    });

    await upsertAgentRunRecord({
      completedAt: "2026-04-15T00:00:12.000Z",
      messageId: "msg_123",
      parentRunId: "run_parent",
      receiverAgentId: "careerai.agent.recruiter",
      requestId: "req_123",
      runId: "run_child",
      senderAgentId: "careerai.gateway.employer_search",
      startedAt: "2026-04-15T00:00:00.000Z",
      status: "completed",
      traceId: "trace_123",
    });

    const message = await getAgentMessageRecordById("msg_123");
    const run = await getAgentRunRecordById("run_child");
    const handoffs = await listAgentHandoffsByParentRunId("run_parent");
    const events = await listAgentTaskEventsByRequestId("req_123");

    expect(message).toMatchObject({
      messageId: "msg_123",
      status: "completed",
      traceId: "trace_123",
    });
    expect(run).toMatchObject({
      runId: "run_child",
      status: "completed",
    });
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0]).toMatchObject({
      handoffId: "handoff_123",
      targetEndpoint: "/api/a2a/agents/recruiter",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventName: "a2a.message.received",
      spanName: "a2a.message.received",
    });
  });

  it("rejects illegal lifecycle transitions", async () => {
    await upsertAgentMessageRecord({
      messageId: "msg_invalid",
      operation: "respond",
      protocolVersion: "a2a.v1",
      receiverAgentId: "careerai.agent.candidate",
      requestId: "req_invalid",
      senderAgentId: "external_service:partner-123",
      sentAt: "2026-04-15T00:00:00.000Z",
      status: "completed",
      taskType: "respond",
      traceId: "trace_invalid",
    });

    await expect(
      upsertAgentMessageRecord({
        messageId: "msg_invalid",
        operation: "respond",
        protocolVersion: "a2a.v1",
        receiverAgentId: "careerai.agent.candidate",
        requestId: "req_invalid",
        senderAgentId: "external_service:partner-123",
        sentAt: "2026-04-15T00:00:00.000Z",
        status: "running",
        taskType: "respond",
        traceId: "trace_invalid",
      }),
    ).rejects.toThrow("Invalid agent task status transition");
  });
});
