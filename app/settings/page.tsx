import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { ProfileAccountPage } from "@/components/profile-account-page";
import {
  getPersonaFromRoleType,
  getPersonaSignInRoute,
  getSettingsRoute,
} from "@/lib/personas";
import { getServerPreferredPersona } from "@/lib/server-persona-preference";

export default async function SettingsPage() {
  const session = await auth();
  const preferredPersona =
    getPersonaFromRoleType(session?.user?.roleType) ?? (await getServerPreferredPersona());

  if (preferredPersona === "employer") {
    redirect(getSettingsRoute(preferredPersona));
  }

  if (!session?.user?.email) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: getSettingsRoute(preferredPersona),
        persona: preferredPersona,
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
    correlationId: `settings_page_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
  });

  return <ProfileAccountPage context={context} preferredPersona={preferredPersona} />;
}
