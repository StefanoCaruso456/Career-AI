import type { LocationMatchLevel, WorkplaceType } from "./types";
import { normalizeText, tokenize, uniqueStrings } from "./utils";

type StateRecord = {
  code: string;
  name: string;
};

type LocationAliasRecord = {
  aliases: string[];
  city: string | null;
  country: string;
  countryCode: string;
  metro: string | null;
  state: string | null;
  stateCode: string | null;
  timezone: string | null;
};

const STATES: StateRecord[] = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DC", "District of Columbia"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["IA", "Iowa"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["MA", "Massachusetts"],
  ["MD", "Maryland"],
  ["ME", "Maine"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MO", "Missouri"],
  ["MS", "Mississippi"],
  ["MT", "Montana"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["NE", "Nebraska"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NV", "Nevada"],
  ["NY", "New York"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VA", "Virginia"],
  ["VT", "Vermont"],
  ["WA", "Washington"],
  ["WI", "Wisconsin"],
  ["WV", "West Virginia"],
  ["WY", "Wyoming"],
].map(([code, name]) => ({ code, name }));

const LOCATION_ALIASES: LocationAliasRecord[] = [
  {
    aliases: ["austin", "austin tx", "austin texas"],
    city: "Austin",
    country: "United States",
    countryCode: "US",
    metro: "Austin Metro",
    state: "Texas",
    stateCode: "TX",
    timezone: "America/Chicago",
  },
  {
    aliases: ["sf", "san francisco", "san francisco ca", "bay area", "sf bay area"],
    city: "San Francisco",
    country: "United States",
    countryCode: "US",
    metro: "San Francisco Bay Area",
    state: "California",
    stateCode: "CA",
    timezone: "America/Los_Angeles",
  },
  {
    aliases: ["nyc", "new york city", "new york ny"],
    city: "New York City",
    country: "United States",
    countryCode: "US",
    metro: "New York City Metro",
    state: "New York",
    stateCode: "NY",
    timezone: "America/New_York",
  },
  {
    aliases: ["dfw", "dallas fort worth", "dallas-fort worth"],
    city: null,
    country: "United States",
    countryCode: "US",
    metro: "Dallas-Fort Worth",
    state: "Texas",
    stateCode: "TX",
    timezone: "America/Chicago",
  },
  {
    aliases: ["remote us", "remote usa", "remote united states"],
    city: null,
    country: "United States",
    countryCode: "US",
    metro: null,
    state: null,
    stateCode: null,
    timezone: null,
  },
];

const STATE_LOOKUP = new Map<string, StateRecord>(
  STATES.flatMap((state) => [
    [normalizeText(state.code), state],
    [normalizeText(state.name), state],
  ]),
);

function findAliasMatch(value: string) {
  const normalized = normalizeText(value);

  return (
    LOCATION_ALIASES.find((alias) =>
      alias.aliases.some((entry) => normalized === normalizeText(entry)),
    ) ??
    LOCATION_ALIASES.find((alias) =>
      alias.aliases.some((entry) => normalized.includes(normalizeText(entry))),
    ) ??
    null
  );
}

export function normalizeLocationPhrase(value: string | null | undefined) {
  const raw = value?.trim() || null;
  const normalized = normalizeText(raw);
  const alias = raw ? findAliasMatch(raw) : null;

  if (!raw) {
    return null;
  }

  if (alias) {
    return {
      city: alias.city,
      country: alias.country,
      country_code: alias.countryCode,
      metro: alias.metro,
      normalized,
      original: raw,
      state: alias.state,
      state_code: alias.stateCode,
      timezone: alias.timezone,
    };
  }

  const commaParts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const stateCandidate = commaParts.length > 1 ? STATE_LOOKUP.get(normalizeText(commaParts[1])) : null;

  if (stateCandidate) {
    return {
      city: commaParts[0] ?? null,
      country: "United States",
      country_code: "US",
      metro: null,
      normalized,
      original: raw,
      state: stateCandidate.name,
      state_code: stateCandidate.code,
      timezone: null,
    };
  }

  const tokens = raw.split(/\s+/);

  if (tokens.length >= 2) {
    const state = STATE_LOOKUP.get(normalizeText(tokens.slice(-1)[0]));

    if (state) {
      return {
        city: tokens.slice(0, -1).join(" "),
        country: "United States",
        country_code: "US",
        metro: null,
        normalized,
        original: raw,
        state: state.name,
        state_code: state.code,
        timezone: null,
      };
    }
  }

  const bareState = STATE_LOOKUP.get(normalized);

  if (bareState) {
    return {
      city: null,
      country: "United States",
      country_code: "US",
      metro: null,
      normalized,
      original: raw,
      state: bareState.name,
      state_code: bareState.code,
      timezone: null,
    };
  }

  return {
    city: raw,
    country: null,
    country_code: null,
    metro: null,
    normalized,
    original: raw,
    state: null,
    state_code: null,
    timezone: null,
  };
}

export function parseJobLocation(args: {
  raw: string | null;
  workplaceType: WorkplaceType;
}) {
  const raw = args.raw?.trim() || null;
  const alias = raw ? findAliasMatch(raw) : null;
  const normalized = normalizeLocationPhrase(raw);
  const tokens = uniqueStrings([
    ...(raw ? tokenize(raw) : []),
    normalized?.city ?? null,
    normalized?.state ?? null,
    normalized?.state_code ?? null,
    normalized?.metro ?? null,
    normalized?.country ?? null,
  ]);

  return {
    city: normalized?.city ?? null,
    country: normalized?.country ?? (raw && /\b(?:usa|us|united states)\b/i.test(raw) ? "United States" : null),
    country_code: normalized?.country_code ?? (raw && /\b(?:usa|us|united states)\b/i.test(raw) ? "US" : null),
    hybrid_allowed: args.workplaceType === "hybrid" || (raw ? /\bhybrid\b/i.test(raw) : false),
    location_tokens: tokens,
    metro: normalized?.metro ?? null,
    onsite_required: args.workplaceType === "onsite",
    raw,
    remote_allowed:
      args.workplaceType === "remote" ||
      (raw ? /\bremote\b/i.test(raw) : false) ||
      normalizeText(raw).startsWith("remote"),
    state: normalized?.state ?? null,
    state_code: normalized?.state_code ?? null,
    timezone: normalized?.timezone ?? null,
  };
}

export function describeLocationMatch(level: LocationMatchLevel, locationLabel: string | null) {
  if (level === "city_state") {
    return `Exact ${locationLabel ?? "city"} location match`;
  }

  if (level === "metro") {
    return `Metro-area fallback match${locationLabel ? ` in ${locationLabel}` : ""}`;
  }

  if (level === "state") {
    return `State-level fallback match${locationLabel ? ` in ${locationLabel}` : ""}`;
  }

  if (level === "country") {
    return `Country-level fallback match${locationLabel ? ` in ${locationLabel}` : ""}`;
  }

  return "Remote fallback match";
}

export function buildLocationLabel(args: {
  city: string | null;
  metro: string | null;
  stateCode: string | null;
  state: string | null;
}) {
  if (args.city && args.stateCode) {
    return `${args.city}, ${args.stateCode}`;
  }

  if (args.metro) {
    return args.metro;
  }

  return args.state;
}
