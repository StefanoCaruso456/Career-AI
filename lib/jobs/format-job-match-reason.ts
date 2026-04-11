type MatchReasonSource = {
  matchReason?: string | null;
  matchReasons?: string[] | null;
  matchSummary?: string | null;
};

function collectRawReasons(source: MatchReasonSource) {
  const rawSegments = [
    ...(source.matchReasons ?? []),
    source.matchSummary ?? null,
    source.matchReason ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) =>
      value
        .split(/[;,]/)
        .map((segment) => segment.trim())
        .filter(Boolean),
    );

  return Array.from(new Set(rawSegments.map((segment) => segment.toLowerCase())));
}

function extractReasonValue(reasons: string[], prefix: string) {
  const match = reasons.find((reason) => reason.startsWith(prefix));

  return match ? match.slice(prefix.length).trim() : null;
}

export function formatJobMatchReason(source: MatchReasonSource) {
  const reasons = collectRawReasons(source);
  const alignedRole = extractReasonValue(reasons, "title aligned with ");

  if (alignedRole) {
    return `Strong ${alignedRole} fit`;
  }

  if (reasons.some((reason) => reason.startsWith("location aligned"))) {
    return "Strong location fit";
  }

  if (
    reasons.some(
      (reason) =>
        reason.includes("remote preference matched") ||
        reason.includes("workplace preference matched"),
    )
  ) {
    return "Matches your workplace preference";
  }

  if (
    reasons.some(
      (reason) =>
        reason.startsWith("skills matched") || reason.includes("skill overlap"),
    )
  ) {
    return "Relevant skill overlap";
  }

  if (
    reasons.some(
      (reason) =>
        reason.includes("profile aligned") ||
        reason.includes("background aligned") ||
        reason.includes("career id"),
    )
  ) {
    return "Aligned with your background";
  }

  if (
    reasons.some(
      (reason) =>
        reason.includes("validated from a trusted source") ||
        reason.includes("trusted source"),
    )
  ) {
    return "Verified live listing";
  }

  if (reasons.some((reason) => reason.includes("fresh posting"))) {
    return "Recently posted";
  }

  return "Grounded live match";
}
