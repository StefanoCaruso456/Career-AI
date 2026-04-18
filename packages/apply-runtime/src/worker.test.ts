import { describe, expect, it } from "vitest";
import { kickAutonomousApplyWorker, runAutonomousApplyWorkerCycle } from "./worker";

describe("autonomous apply worker module", () => {
  it("exports the worker entry points", () => {
    expect(typeof kickAutonomousApplyWorker).toBe("function");
    expect(typeof runAutonomousApplyWorkerCycle).toBe("function");
  });
});
