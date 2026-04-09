import { ApiError, type TalentIdentityAggregate } from "@/packages/contracts/src";
import {
  findPersistentContextByEmail,
  findPersistentContextByUserId,
  provisionGoogleUser,
  type PersistentTalentIdentityContext,
} from "@/packages/persistence/src";

type SessionUserLike = {
  appUserId?: string | null;
  authProvider?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  image?: string | null;
  name?: string | null;
  providerUserId?: string | null;
};

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
      fullName: normalizedName,
      firstName,
      lastName: rest.join(" ").trim() || "Member",
    };
  }

  if (user.email?.trim()) {
    const [firstName, ...rest] = normalizeDisplayNameFromEmail(user.email);
    const lastName = rest.join(" ").trim() || "Member";

    return {
      fullName: `${firstName || "Career"} ${lastName}`.trim(),
      firstName: firstName || "Career",
      lastName,
    };
  }

  return {
    fullName: "Career Member",
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

export async function getPersistentCareerIdentityForSessionUser(args: {
  user: SessionUserLike;
  correlationId: string;
}) {
  if (args.user.appUserId) {
    try {
      return await findPersistentContextByUserId({
        userId: args.user.appUserId,
        correlationId: args.correlationId,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.errorCode !== "NOT_FOUND") {
        throw error;
      }
    }
  }

  return findPersistentContextByEmail({
    email: requireSessionEmail(args.user, args.correlationId),
    correlationId: args.correlationId,
  });
}

export async function ensurePersistentCareerIdentityForSessionUser(args: {
  user: SessionUserLike;
  correlationId: string;
}) {
  const email = requireSessionEmail(args.user, args.correlationId);

  if (args.user.providerUserId) {
    const { fullName, firstName, lastName } = deriveIdentityName(args.user);

    return provisionGoogleUser({
      email,
      fullName,
      firstName,
      lastName,
      imageUrl: args.user.image ?? null,
      providerUserId: args.user.providerUserId,
      emailVerified: args.user.emailVerified ?? true,
      correlationId: args.correlationId,
    });
  }

  const context = await getPersistentCareerIdentityForSessionUser(args);

  return {
    context,
    createdUser: false,
    createdIdentity: false,
  };
}

export async function ensureTalentIdentityForSessionUser(args: {
  user: SessionUserLike;
  correlationId: string;
}): Promise<TalentIdentityAggregate> {
  const result = await ensurePersistentCareerIdentityForSessionUser(args);

  return result.context.aggregate;
}

export function getDisplayNameForContext(context: PersistentTalentIdentityContext) {
  return context.user.fullName || context.aggregate.talentIdentity.display_name;
}
