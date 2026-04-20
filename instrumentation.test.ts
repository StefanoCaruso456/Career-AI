import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureAutonomousApplyInlineWorkerLoopStarted: vi.fn(),
  getBraintrustLogger: vi.fn(),
}));

vi.mock("@/lib/braintrust", () => ({
  getBraintrustLogger: mocks.getBraintrustLogger,
}));

vi.mock("@/packages/apply-runtime/src", () => ({
  ensureAutonomousApplyInlineWorkerLoopStarted: mocks.ensureAutonomousApplyInlineWorkerLoopStarted,
}));

import { register } from "./instrumentation";

describe("instrumentation register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NEXT_RUNTIME;
  });

  it("starts the inline autonomous apply worker loop for node runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";

    await register();

    expect(mocks.getBraintrustLogger).toHaveBeenCalledTimes(1);
    expect(mocks.ensureAutonomousApplyInlineWorkerLoopStarted).toHaveBeenCalledTimes(1);
  });

  it("skips node-only instrumentation outside the node runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";

    await register();

    expect(mocks.getBraintrustLogger).not.toHaveBeenCalled();
    expect(mocks.ensureAutonomousApplyInlineWorkerLoopStarted).not.toHaveBeenCalled();
  });
});
