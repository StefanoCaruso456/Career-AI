import type { SalaryPeriod } from "./types";

export function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9$%+#./ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string | null | undefined) {
  return normalizeText(value)
    .split(/[^a-z0-9+#./$%-]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value && value.length > 0)),
    ),
  );
}

export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function flattenPayloadStrings(
  value: unknown,
  prefix = "",
  sink: string[] = [],
  depth = 0,
): string[] {
  if (value === null || value === undefined || depth > 4) {
    return sink;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length > 0) {
      sink.push(prefix ? `${prefix}: ${trimmed}` : trimmed);
    }

    return sink;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    sink.push(prefix ? `${prefix}: ${String(value)}` : String(value));
    return sink;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      flattenPayloadStrings(entry, prefix, sink, depth + 1);
    }

    return sink;
  }

  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      flattenPayloadStrings(entry, key, sink, depth + 1);
    }
  }

  return sink;
}

export function chunkText(text: string, chunkSize = 220) {
  const tokens = tokenize(text);
  const chunks: string[] = [];

  for (let index = 0; index < tokens.length; index += chunkSize) {
    const chunk = tokens.slice(index, index + chunkSize).join(" ").trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks.length > 0 ? chunks : [normalizeText(text)].filter(Boolean);
}

function parseNumericToken(token: string) {
  const normalized = token.replace(/[$,]/g, "").trim();
  const suffix = normalized.slice(-1).toLowerCase();
  const numericPortion = ["k", "m"].includes(suffix) ? normalized.slice(0, -1) : normalized;
  const parsed = Number.parseFloat(numericPortion);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (suffix === "k") {
    return parsed * 1_000;
  }

  if (suffix === "m") {
    return parsed * 1_000_000;
  }

  return parsed;
}

export function parseSalaryText(text: string | null | undefined): {
  currency: string | null;
  max: number | null;
  min: number | null;
  period: SalaryPeriod;
  rawText: string | null;
} {
  const rawText = text?.trim() || null;

  if (!rawText) {
    return {
      currency: null,
      max: null,
      min: null,
      period: "unknown",
      rawText: null,
    };
  }

  const normalized = normalizeText(rawText);
  const currency = rawText.includes("€") ? "EUR" : rawText.includes("£") ? "GBP" : "USD";
  const period =
    /\b(hour|hourly|hr|per hour)\b/i.test(rawText)
      ? "hourly"
      : /\b(month|monthly|per month)\b/i.test(rawText)
        ? "monthly"
        : /\b(year|yearly|annual|annually|yr|per year)\b/i.test(rawText) || /k\b/i.test(rawText)
          ? "yearly"
          : "unknown";
  const matches = Array.from(rawText.matchAll(/[$£€]?\s*\d[\d,.]*(?:\.\d+)?\s*[kKmM]?/g))
    .map((match) => parseNumericToken(match[0] ?? ""))
    .filter((value): value is number => value !== null);

  if (matches.length === 0) {
    return {
      currency,
      max: null,
      min: null,
      period,
      rawText,
    };
  }

  if (matches.length >= 2) {
    const [first, second] = matches;

    return {
      currency,
      max: Math.max(first, second),
      min: Math.min(first, second),
      period,
      rawText,
    };
  }

  const [onlyValue] = matches;

  if (/\b(under|below|up to|maximum|max)\b/i.test(rawText)) {
    return {
      currency,
      max: onlyValue,
      min: null,
      period,
      rawText,
    };
  }

  if (/\b(over|above|at least|minimum|min|from|starting)\b/i.test(rawText)) {
    return {
      currency,
      max: null,
      min: onlyValue,
      period,
      rawText,
    };
  }

  return {
    currency,
    max: onlyValue,
    min: onlyValue,
    period,
    rawText,
  };
}

export function buildWeightedVector(values: Array<{ term: string; weight: number }>) {
  const vector = new Map<string, number>();

  for (const entry of values) {
    const normalized = normalizeText(entry.term);

    if (!normalized) {
      continue;
    }

    vector.set(normalized, (vector.get(normalized) ?? 0) + entry.weight);
  }

  return vector;
}

export function cosineSimilarity(left: Map<string, number>, right: Map<string, number>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (const value of left.values()) {
    leftMagnitude += value * value;
  }

  for (const value of right.values()) {
    rightMagnitude += value * value;
  }

  for (const [term, value] of left.entries()) {
    dot += value * (right.get(term) ?? 0);
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function formatCurrency(value: number | null, period: SalaryPeriod) {
  if (value === null) {
    return null;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

  if (period === "hourly") {
    return `${formatted}/hr`;
  }

  if (period === "monthly") {
    return `${formatted}/mo`;
  }

  if (period === "yearly") {
    return `${formatted}/yr`;
  }

  return formatted;
}

export function createTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
  });
  const offsetPart = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = offsetPart.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);

  if (!match) {
    return 0;
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);

  return (hours * 60 + Math.sign(hours || 1) * minutes) * 60 * 1_000;
}

export function startOfDayInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = Number.parseInt(parts.find((part) => part.type === "year")?.value ?? "1970", 10);
  const month = Number.parseInt(parts.find((part) => part.type === "month")?.value ?? "1", 10);
  const day = Number.parseInt(parts.find((part) => part.type === "day")?.value ?? "1", 10);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offsetMs = createTimeZoneOffsetMs(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offsetMs);
}

export function startOfWeekInTimeZone(date: Date, timeZone: string) {
  const startOfDay = startOfDayInTimeZone(date, timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const mondayOffset = weekdayIndex <= 0 ? 6 : weekdayIndex - 1;

  return new Date(startOfDay.getTime() - mondayOffset * 24 * 60 * 60 * 1_000);
}

export function overlapScore(needles: string[], haystack: string[]) {
  if (needles.length === 0 || haystack.length === 0) {
    return 0;
  }

  const haystackSet = new Set(haystack.map((item) => normalizeText(item)));
  const matched = needles.filter((needle) => haystackSet.has(normalizeText(needle)));

  return matched.length / needles.length;
}
