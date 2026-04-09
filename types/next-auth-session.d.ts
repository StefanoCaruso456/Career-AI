import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      appUserId?: string | null;
      authProvider?: string | null;
      currentStep?: number | null;
      onboardingStatus?: "not_started" | "in_progress" | "completed" | null;
      profileCompletionPercent?: number | null;
      providerUserId?: string | null;
      roleType?: string | null;
      soulRecordId?: string | null;
      talentAgentId?: string | null;
      talentIdentityId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    appUserId?: string | null;
    authProvider?: string | null;
    currentStep?: number | null;
    onboardingStatus?: "not_started" | "in_progress" | "completed" | null;
    profileCompletionPercent?: number | null;
    providerUserId?: string | null;
    roleType?: string | null;
    soulRecordId?: string | null;
    talentAgentId?: string | null;
    talentIdentityId?: string | null;
  }
}
