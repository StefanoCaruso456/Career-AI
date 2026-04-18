import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAutonomousApplyInlineWorkerConcurrency } from "./config";

let previousConcurrency: string | undefined;

beforeEach(() => {
  previousConcurrency = process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY;
});

afterEach(() => {
  if (previousConcurrency === undefined) {
    delete process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY;
  } else {
    process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY = previousConcurrency;
  }
});

describe("autonomous apply config", () => {
  it("caps inline worker concurrency to the safe upper bound", () => {
    process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY = "99";

    expect(getAutonomousApplyInlineWorkerConcurrency()).toBe(4);
  });

  it("uses a minimum concurrency of one worker slot", () => {
    process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY = "0";

    expect(getAutonomousApplyInlineWorkerConcurrency()).toBe(1);
  });
});
