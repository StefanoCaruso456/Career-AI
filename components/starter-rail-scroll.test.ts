import { describe, expect, it } from "vitest";
import {
  clampStarterRailScrollTarget,
  getNextStarterRailScrollFrame,
  getNormalizedStarterRailWheelDelta,
  getStarterRailMaxScroll,
} from "./starter-rail-scroll";

describe("starter rail scroll helpers", () => {
  it("clamps the target scroll position inside the visible rail range", () => {
    expect(getStarterRailMaxScroll(1320, 720)).toBe(600);
    expect(
      clampStarterRailScrollTarget({
        clientWidth: 720,
        scrollWidth: 1320,
        targetLeft: -40,
      }),
    ).toBe(0);
    expect(
      clampStarterRailScrollTarget({
        clientWidth: 720,
        scrollWidth: 1320,
        targetLeft: 900,
      }),
    ).toBe(600);
  });

  it("normalizes wheel input across pixel, line, and page delta modes", () => {
    expect(
      getNormalizedStarterRailWheelDelta({
        clientWidth: 720,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 48,
      }),
    ).toBe(48);
    expect(
      getNormalizedStarterRailWheelDelta({
        clientWidth: 720,
        deltaMode: 1,
        deltaX: 0,
        deltaY: 3,
      }),
    ).toBe(54);
    expect(
      getNormalizedStarterRailWheelDelta({
        clientWidth: 720,
        deltaMode: 2,
        deltaX: 0,
        deltaY: 1,
      }),
    ).toBeCloseTo(612);
  });

  it("advances the rail in eased steps and snaps when the target is close", () => {
    expect(
      getNextStarterRailScrollFrame({
        currentLeft: 100,
        targetLeft: 220,
      }),
    ).toEqual({
      done: false,
      left: 121.6,
    });
    expect(
      getNextStarterRailScrollFrame({
        currentLeft: 219.7,
        targetLeft: 220,
      }),
    ).toEqual({
      done: true,
      left: 220,
    });
  });
});
