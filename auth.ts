import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getAuthSecret, getGoogleClientId, getGoogleClientSecret, getGoogleRedirectUri, getPublicBaseUrl } from "@/auth-config";

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
  googleClientId && googleClientSecret && publicBaseUrl && authSecret,
);

export const publicOrigin = publicBaseUrl;
export const googleRedirectUri = getGoogleRedirectUri();

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
