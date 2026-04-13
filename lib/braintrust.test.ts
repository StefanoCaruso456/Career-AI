import { afterEach, describe, expect, it } from "vitest";
import {
  runWithBraintrustRootSpan,
  runWithCurrentBraintrustSpan,
  setBraintrustModuleLoaderForTest,
} from "./braintrust";

describe("braintrust optional loader", () => {
  afterEach(() => {
    setBraintrustModuleLoaderForTest(null);
  });

  it("falls back to a no-op root span when the braintrust module is unavailable", () => {
    setBraintrustModuleLoaderForTest(() => null);

    const result = runWithBraintrustRootSpan((span) => {
      span.log({ metadata: { source: "test" } });
      return span.rootSpanId;
    });

    expect(result).toEqual(expect.stringMatching(/^noop-root-/));
  });

  it("falls back to a no-op current span when the braintrust module is unavailable", () => {
    setBraintrustModuleLoaderForTest(() => null);

    const result = runWithCurrentBraintrustSpan((span) => {
      span.log({ metadata: { source: "test" } });
      return span.rootSpanId;
    });

    expect(result).toEqual(expect.stringMatching(/^noop-root-/));
  });
});
