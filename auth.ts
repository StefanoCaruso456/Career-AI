import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { ensureTalentIdentityForSessionUser } from "@/auth-identity";
import {
  getAuthSecret,
  getGoogleAuthStatus,
  getGoogleClientId,
  getGoogleClientSecret,
  getPublicBaseUrl,
} from "@/auth-config";

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
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const googleProfile = profile as { email?: string; email_verified?: boolean } | undefined;

        return googleProfile?.email_verified === true && Boolean(googleProfile.email?.trim());
      }

      return true;
    },
    async jwt({ token, account }) {
      if (
        typeof token.email === "string" &&
        (account?.provider === "google" || !token.talentIdentityId || !token.talentAgentId || !token.soulRecordId)
      ) {
        try {
          const aggregate = ensureTalentIdentityForSessionUser({
            user: {
              email: token.email,
              name: typeof token.name === "string" ? token.name : null,
            },
            correlationId: `auth_jwt_${token.sub ?? crypto.randomUUID()}`,
          });

          token.talentIdentityId = aggregate.talentIdentity.id;
          token.talentAgentId = aggregate.talentIdentity.talent_agent_id;
          token.soulRecordId = aggregate.soulRecord.id;
        } catch {
          token.talentIdentityId = token.talentIdentityId ?? null;
          token.talentAgentId = token.talentAgentId ?? null;
          token.soulRecordId = token.soulRecordId ?? null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = session.user.name ?? token.name ?? null;
        session.user.email = session.user.email ?? token.email ?? null;
        session.user.image = session.user.image ?? (typeof token.picture === "string" ? token.picture : null);
        session.user.talentIdentityId =
          typeof token.talentIdentityId === "string" ? token.talentIdentityId : null;
        session.user.talentAgentId =
          typeof token.talentAgentId === "string" ? token.talentAgentId : null;
        session.user.soulRecordId =
          typeof token.soulRecordId === "string" ? token.soulRecordId : null;
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
