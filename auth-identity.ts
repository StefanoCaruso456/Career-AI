import { ApiError, type TalentIdentityAggregate } from "@/packages/contracts/src";
import {
  createTalentIdentity,
  getTalentIdentity,
  getTalentIdentityByEmail,
} from "@/packages/identity-domain/src";

type SessionUserLike = {
  email?: string | null;
  name?: string | null;
};

const DEFAULT_COUNTRY_CODE = "ZZ";

function toTitleCase(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeDisplayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";

  return localPart
    .split(/[^a-zA-Z0-9]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(toTitleCase);
}

function deriveIdentityName(user: SessionUserLike) {
  const normalizedName = user.name?.replace(/\s+/g, " ").trim();

  if (normalizedName) {
    const [firstName, ...rest] = normalizedName.split(" ");

    return {
      firstName,
      lastName: rest.join(" ").trim() || "Member",
    };
  }

  if (user.email?.trim()) {
    const [firstName, ...rest] = normalizeDisplayNameFromEmail(user.email);

    return {
      firstName: firstName || "Career",
      lastName: rest.join(" ").trim() || "Member",
    };
  }

  return {
    firstName: "Career",
    lastName: "Member",
  };
}

export function requireSessionEmail(user: SessionUserLike, correlationId: string) {
  const normalizedEmail = user.email?.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new ApiError({
      errorCode: "UNAUTHORIZED",
      status: 401,
      message: "An authenticated Google email is required.",
      details: null,
      correlationId,
    });
  }

  return normalizedEmail;
}

export function ensureTalentIdentityForSessionUser(args: {
  user: SessionUserLike;
  correlationId: string;
}): TalentIdentityAggregate {
  const email = requireSessionEmail(args.user, args.correlationId);

  try {
    return getTalentIdentityByEmail({
      email,
      correlationId: args.correlationId,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.errorCode !== "NOT_FOUND") {
      throw error;
    }
  }

  const { firstName, lastName } = deriveIdentityName(args.user);
  const created = createTalentIdentity({
    input: {
      email,
      firstName,
      lastName,
      countryCode: DEFAULT_COUNTRY_CODE,
    },
    actorType: "system_service",
    actorId: `google_oauth:${email}`,
    correlationId: args.correlationId,
  });

  return getTalentIdentity({
    talentIdentityId: created.talentIdentity.id,
    correlationId: args.correlationId,
  });
}
