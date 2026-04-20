import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function GatedAccountLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.email) {
    return <>{children}</>;
  }

  if (
    session.user.onboardingStatus !== null &&
    session.user.onboardingStatus !== undefined &&
    session.user.onboardingStatus !== "completed"
  ) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
