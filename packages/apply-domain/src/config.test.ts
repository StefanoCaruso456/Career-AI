import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAutonomousApplyInlineWorkerConcurrency,
  getAutonomousApplyWorkerMode,
  getAutonomousApplyWorkerPollIntervalMs,
} from "./config";

let previousConcurrency: string | undefined;
let previousWorkerMode: string | undefined;
let previousPollInterval: string | undefined;

beforeEach(() => {
  previousConcurrency = process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY;
  previousWorkerMode = process.env.AUTONOMOUS_APPLY_WORKER_MODE;
  previousPollInterval = process.env.AUTONOMOUS_APPLY_WORKER_POLL_INTERVAL_MS;
});

afterEach(() => {
  if (previousConcurrency === undefined) {
    delete process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY;
  } else {
    process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY = previousConcurrency;
  }

  if (previousWorkerMode === undefined) {
    delete process.env.AUTONOMOUS_APPLY_WORKER_MODE;
  } else {
    process.env.AUTONOMOUS_APPLY_WORKER_MODE = previousWorkerMode;
  }

  if (previousPollInterval === undefined) {
    delete process.env.AUTONOMOUS_APPLY_WORKER_POLL_INTERVAL_MS;
  } else {
    process.env.AUTONOMOUS_APPLY_WORKER_POLL_INTERVAL_MS = previousPollInterval;
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

  it("supports an external worker mode for out-of-process execution", () => {
    process.env.AUTONOMOUS_APPLY_WORKER_MODE = "external";

    expect(getAutonomousApplyWorkerMode()).toBe("external");
  });

  it("uses the default worker poll interval when no value is configured", () => {
    delete process.env.AUTONOMOUS_APPLY_WORKER_POLL_INTERVAL_MS;

    expect(getAutonomousApplyWorkerPollIntervalMs()).toBe(5_000);
  });
});
