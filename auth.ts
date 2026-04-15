import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || process.env.CLIENT_ID?.trim() || "";
}

export function getGoogleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.CLIENT_SECRET?.trim() || "";
}

export function getAuthSecret() {
  return process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || "";
}

export function getPublicBaseUrl() {
  const configuredUrl = process.env.NEXTAUTH_URL?.trim();

  if (configuredUrl) {
    return normalizeBaseUrl(configuredUrl);
  }

  const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

  if (railwayPublicDomain) {
    return normalizeBaseUrl(`https://${railwayPublicDomain}`);
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return "";
}

const googleClientId = getGoogleClientId();
const googleClientSecret = getGoogleClientSecret();
const publicBaseUrl = getPublicBaseUrl();
const authSecret = getAuthSecret();

if (!process.env.NEXTAUTH_URL && publicBaseUrl) {
  process.env.NEXTAUTH_URL = publicBaseUrl;
}

if (!process.env.NEXTAUTH_SECRET && authSecret) {
  process.env.NEXTAUTH_SECRET = authSecret;
}

export const googleOAuthEnabled = Boolean(
  googleClientId && googleClientSecret,
);

export const publicOrigin = publicBaseUrl;
export const googleRedirectUri = publicBaseUrl
  ? `${publicBaseUrl}/api/auth/callback/google`
  : "";

export const authOptions = {
  providers: googleOAuthEnabled
    ? [
        GoogleProvider({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          authorization: {
            params: {
              prompt: "select_account",
            },
          },
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
        const googleProfile = profile as { email_verified?: boolean } | undefined;

        return googleProfile?.email_verified === true;
      }

      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = session.user.name ?? token.name ?? null;
        session.user.email = session.user.email ?? token.email ?? null;
        session.user.image = session.user.image ?? (typeof token.picture === "string" ? token.picture : null);
      }

      return session;
    },
  },
} satisfies NextAuthOptions;

export function auth() {
  return getServerSession(authOptions);
}
