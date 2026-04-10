import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import {
  getAuthSecret,
  getGoogleAuthStatus,
  getGoogleClientId,
  getGoogleClientSecret,
  getPublicBaseUrl,
} from "@/auth-config";

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  sub?: string;
};

const googleClientId = getGoogleClientId();
const googleClientSecret = getGoogleClientSecret();
const publicBaseUrl = getPublicBaseUrl();
const authSecret = getAuthSecret();
const googleAuthStatus = getGoogleAuthStatus();
const authSessionEnabled = Boolean(authSecret);

if (!process.env.NEXTAUTH_URL && publicBaseUrl) {
  process.env.NEXTAUTH_URL = publicBaseUrl;
}

if (!process.env.NEXTAUTH_SECRET && authSecret) {
  process.env.NEXTAUTH_SECRET = authSecret;
}

export const googleOAuthEnabled = googleAuthStatus.enabled;
export const authEnabled = authSessionEnabled;

export const publicOrigin = publicBaseUrl;
export const googleRedirectUri = googleAuthStatus.redirectUri;
export const googleOAuthMissingRequirements = googleAuthStatus.missingRequirements;
export const googleOAuthDisabledMessage = googleAuthStatus.disabledMessage;

function getGoogleProfile(profile: unknown) {
  return profile as GoogleProfile | undefined;
}

function getProviderUserId(
  provider: string | undefined,
  args: {
    accountProviderUserId?: string | null;
    profile?: GoogleProfile;
    tokenProviderUserId?: string | null;
    tokenSub?: string | null;
  },
) {
  if (provider !== "google") {
    return args.tokenProviderUserId ?? null;
  }

  return (
    args.accountProviderUserId ??
    args.profile?.sub ??
    args.tokenProviderUserId ??
    args.tokenSub ??
    null
  );
}

function applyPersistentContextToToken(
  token: Record<string, unknown>,
  context: Awaited<ReturnType<typeof ensurePersistentCareerIdentityForSessionUser>>["context"],
) {
  token.name = context.user.fullName;
  token.email = context.user.email;
  token.picture = context.user.imageUrl ?? null;
  token.appUserId = context.user.id;
  token.authProvider = context.user.authProvider;
  token.providerUserId = context.user.providerUserId;
  token.talentIdentityId = context.aggregate.talentIdentity.id;
  token.talentAgentId = context.aggregate.talentIdentity.talent_agent_id;
  token.soulRecordId = context.aggregate.soulRecord.id;
  token.onboardingStatus = context.onboarding.status;
  token.currentStep = context.onboarding.currentStep;
  token.profileCompletionPercent = context.onboarding.profileCompletionPercent;
  token.roleType = context.onboarding.roleType;

  return token;
}

function toOnboardingStatus(value: unknown) {
  if (value === "not_started" || value === "in_progress" || value === "completed") {
    return value;
  }

  return null;
}

export const authOptions = {
  secret: authSecret || undefined,
  providers: googleOAuthEnabled
    ? [
        GoogleProvider({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      ]
    : [],
  pages: {
    signIn: "/sign-in",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        const googleProfile = getGoogleProfile(profile);
        const normalizedEmail = googleProfile?.email?.trim().toLowerCase();
        const providerUserId = getProviderUserId(account.provider, {
          accountProviderUserId: account.providerAccountId,
          profile: googleProfile,
        });

        if (googleProfile?.email_verified !== true || !normalizedEmail || !providerUserId) {
          return false;
        }

        await ensurePersistentCareerIdentityForSessionUser({
          user: {
            email: normalizedEmail,
            emailVerified: true,
            image:
              typeof user.image === "string"
                ? user.image
                : googleProfile.picture ?? null,
            name:
              typeof user.name === "string" ? user.name : googleProfile.name ?? null,
            providerUserId,
          },
          correlationId: `auth_sign_in_${providerUserId}`,
        });
      }

      return true;
    },
    async jwt({ token, account, profile, user }) {
      const googleProfile = getGoogleProfile(profile);
      const email =
        typeof token.email === "string"
          ? token.email
          : typeof user?.email === "string"
            ? user.email
            : googleProfile?.email ?? null;
      const shouldHydratePersistentContext =
        typeof email === "string" &&
        (
          account?.provider === "google" ||
          !token.appUserId ||
          !token.talentIdentityId ||
          !token.talentAgentId ||
          !token.soulRecordId ||
          !token.onboardingStatus
        );

      if (shouldHydratePersistentContext) {
        try {
          const result = await ensurePersistentCareerIdentityForSessionUser({
            user: {
              appUserId:
                typeof token.appUserId === "string" ? token.appUserId : null,
              authProvider:
                typeof token.authProvider === "string" ? token.authProvider : null,
              email,
              emailVerified: googleProfile?.email_verified ?? true,
              image:
                typeof user?.image === "string"
                  ? user.image
                  : typeof token.picture === "string"
                    ? token.picture
                    : googleProfile?.picture ?? null,
              name:
                typeof user?.name === "string"
                  ? user.name
                  : typeof token.name === "string"
                    ? token.name
                    : googleProfile?.name ?? null,
              providerUserId: getProviderUserId(account?.provider, {
                accountProviderUserId: account?.providerAccountId,
                profile: googleProfile,
                tokenProviderUserId:
                  typeof token.providerUserId === "string"
                    ? token.providerUserId
                    : null,
                tokenSub: typeof token.sub === "string" ? token.sub : null,
              }),
            },
            correlationId:
              typeof token.sub === "string"
                ? `auth_jwt_${token.sub}`
                : `auth_jwt_${crypto.randomUUID()}`,
          });

          applyPersistentContextToToken(
            token as unknown as Record<string, unknown>,
            result.context,
          );
        } catch {
          token.appUserId = (token.appUserId as string | undefined) ?? null;
          token.authProvider = (token.authProvider as string | undefined) ?? null;
          token.providerUserId = (token.providerUserId as string | undefined) ?? null;
          token.talentIdentityId = (token.talentIdentityId as string | undefined) ?? null;
          token.talentAgentId = (token.talentAgentId as string | undefined) ?? null;
          token.soulRecordId = (token.soulRecordId as string | undefined) ?? null;
          token.onboardingStatus = toOnboardingStatus(token.onboardingStatus);
          token.currentStep = (token.currentStep as number | undefined) ?? null;
          token.profileCompletionPercent =
            (token.profileCompletionPercent as number | undefined) ?? null;
          token.roleType = (token.roleType as string | undefined) ?? null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name =
          typeof token.name === "string" ? token.name : session.user.name ?? null;
        session.user.email =
          typeof token.email === "string" ? token.email : session.user.email ?? null;
        session.user.image =
          typeof token.picture === "string"
            ? token.picture
            : session.user.image ?? null;
        session.user.appUserId =
          typeof token.appUserId === "string" ? token.appUserId : null;
        session.user.authProvider =
          typeof token.authProvider === "string" ? token.authProvider : null;
        session.user.providerUserId =
          typeof token.providerUserId === "string" ? token.providerUserId : null;
        session.user.talentIdentityId =
          typeof token.talentIdentityId === "string" ? token.talentIdentityId : null;
        session.user.talentAgentId =
          typeof token.talentAgentId === "string" ? token.talentAgentId : null;
        session.user.soulRecordId =
          typeof token.soulRecordId === "string" ? token.soulRecordId : null;
        session.user.onboardingStatus =
          toOnboardingStatus(token.onboardingStatus);
        session.user.currentStep =
          typeof token.currentStep === "number" ? token.currentStep : null;
        session.user.profileCompletionPercent =
          typeof token.profileCompletionPercent === "number"
            ? token.profileCompletionPercent
            : null;
        session.user.roleType =
          typeof token.roleType === "string" ? token.roleType : null;
      }

      return session;
    },
  },
} satisfies NextAuthOptions;

export function auth() {
  if (!authSessionEnabled) {
    return Promise.resolve(null);
  }

  return getServerSession(authOptions);
}
