export function createSearchObservability(args: {
  candidateCountsByStage: Record<string, number>;
  latencyBreakdownMs: Record<string, number>;
  totalLatencyMs: number;
  wideningSteps: string[];
  zeroResultReasons: string[];
}) {
  return {
    candidateCountsByStage: args.candidateCountsByStage,
    latencyBreakdownMs: {
      ...args.latencyBreakdownMs,
      total: args.totalLatencyMs,
    },
    wideningSteps: args.wideningSteps,
    zeroResultReasons: args.zeroResultReasons,
  };
}
