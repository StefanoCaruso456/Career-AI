export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getBraintrustLogger } = await import("@/lib/braintrust");
    const { ensureAutonomousApplyInlineWorkerLoopStarted } = await import("@/packages/apply-runtime/src");
    getBraintrustLogger();
    ensureAutonomousApplyInlineWorkerLoopStarted();
  }
}
