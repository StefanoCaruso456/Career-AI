import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { ProfileAccountPage } from "@/components/profile-account-page";
import { getPersonaSignInRoute } from "@/lib/personas";

export default async function EmployerSettingsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: "/employer/settings",
        persona: "employer",
      }),
    );
  }

  const { context } = await ensurePersistentCareerIdentityForSessionUser({
    user: {
      appUserId: session.user.appUserId,
      authProvider: session.user.authProvider,
      email: session.user.email,
      emailVerified: true,
      image: session.user.image,
      name: session.user.name,
      providerUserId: session.user.providerUserId,
    },
    correlationId: `employer_settings_page_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
  });

  return <ProfileAccountPage context={context} preferredPersona="employer" />;
}
