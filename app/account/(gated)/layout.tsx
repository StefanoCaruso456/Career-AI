import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";

export default async function GatedAccountLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.email) {
    return <>{children}</>;
  }

  const { context } = await ensurePersistentCareerIdentityForSessionUser({
    user: {
      appUserId: session.user.appUserId,
      authProvider: session.user.authProvider,
      email: session.user.email,
      image: session.user.image,
      name: session.user.name,
      providerUserId: session.user.providerUserId,
    },
    correlationId: `account_gated_layout_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
  });

  if (context.onboarding.status !== "completed") {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
