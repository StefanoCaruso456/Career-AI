import type { ActorIdentity } from "@/actor-identity";
import { getRequestTraceContext } from "@/lib/tracing";

export type RunTraceRoot = {
  braintrustRootSpanId: string | null;
  requestId: string | null;
  routeName: string | null;
  traceId: string | null;
};

export type RunContext = {
  correlationId: string;
  runId: string;
  traceRoot: RunTraceRoot;
};

export type AgentContext = {
  actor: ActorIdentity;
  ownerId: string;
  preferredPersona: ActorIdentity["preferredPersona"];
  roleType: string | null;
  run: RunContext;
};

export function createRunContext(args: {
  correlationId: string;
  runId?: string | null;
}): RunContext {
  const traceContext = getRequestTraceContext();

  return {
    correlationId: args.correlationId,
    runId: args.runId?.trim() || crypto.randomUUID(),
    traceRoot: {
      braintrustRootSpanId: traceContext?.braintrustRootSpanId ?? null,
      requestId: traceContext?.requestId ?? null,
      routeName: traceContext?.routeName ?? null,
      traceId: traceContext?.traceId ?? null,
    },
  };
}

export function createAgentContext(args: {
  actor: ActorIdentity;
  ownerId: string;
  run: RunContext;
}): AgentContext {
  return {
    actor: args.actor,
    ownerId: args.ownerId,
    preferredPersona: args.actor.preferredPersona,
    roleType: args.actor.roleType ?? null,
    run: args.run,
  };
}
