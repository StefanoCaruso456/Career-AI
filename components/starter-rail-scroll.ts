export function getStarterRailMaxScroll(scrollWidth: number, clientWidth: number) {
  return Math.max(0, scrollWidth - clientWidth);
}

export function clampStarterRailScrollTarget(args: {
  clientWidth: number;
  scrollWidth: number;
  targetLeft: number;
}) {
  return Math.min(
    getStarterRailMaxScroll(args.scrollWidth, args.clientWidth),
    Math.max(0, args.targetLeft),
  );
}

export function getNormalizedStarterRailWheelDelta(args: {
  clientWidth: number;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
}) {
  const intendedHorizontalDelta =
    Math.abs(args.deltaX) > Math.abs(args.deltaY) ? args.deltaX : args.deltaY;

  if (intendedHorizontalDelta === 0) {
    return 0;
  }

  if (args.deltaMode === 1) {
    return intendedHorizontalDelta * 18;
  }

  if (args.deltaMode === 2) {
    return intendedHorizontalDelta * args.clientWidth * 0.85;
  }

  return intendedHorizontalDelta;
}

export function getNextStarterRailScrollFrame(args: {
  currentLeft: number;
  targetLeft: number;
}) {
  const delta = args.targetLeft - args.currentLeft;

  if (Math.abs(delta) <= 0.6) {
    return {
      done: true,
      left: args.targetLeft,
    };
  }

  return {
    done: false,
    left: args.currentLeft + delta * 0.18,
  };
}
