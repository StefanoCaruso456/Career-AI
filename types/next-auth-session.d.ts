import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      soulRecordId?: string | null;
      talentAgentId?: string | null;
      talentIdentityId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    soulRecordId?: string | null;
    talentAgentId?: string | null;
    talentIdentityId?: string | null;
  }
}
