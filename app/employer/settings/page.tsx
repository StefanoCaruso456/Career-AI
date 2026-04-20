import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { CandidateNotificationPreferencesCard } from "@/components/access-requests/candidate-notification-preferences-card";
import { ApplicationProfileSettingsCard } from "@/components/application-profile-settings-card";
import { ProfileAccountDetailsCard } from "@/components/profile-account-details-card";
import { getPersonaSignInRoute, getPostAuthRoute } from "@/lib/personas";
import { getCandidateNotificationPreferences } from "@/packages/access-request-domain/src";
import styles from "@/components/access-requests/access-request-workflow.module.css";

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
  const notificationPreferences = await getCandidateNotificationPreferences({
    correlationId: `employer_settings_notifications_${context.aggregate.talentIdentity.id}`,
    talentIdentityId: context.aggregate.talentIdentity.id,
  });

  return (
    <main className={styles.page}>
      <div className={styles.pageShell}>
        <section className={styles.pageHero}>
          <span className={styles.eyebrow}>Employer settings</span>
          <h1>Profile and alert controls</h1>
          <p className={styles.lead}>
            Manage the same owned profile, alert delivery, and reusable application profiles here,
            then jump straight back into the hiring workspace when you are done.
          </p>
        </section>

        <nav aria-label="Settings tabs" className={styles.sectionTabs}>
          <a className={styles.sectionTab} href="#profile-settings">
            Profile
          </a>
          <a className={styles.sectionTab} href="#alert-settings">
            Alerts
          </a>
          <a className={styles.sectionTab} href="#application-profile-settings">
            Application profiles
          </a>
          <a className={styles.sectionTab} href={getPostAuthRoute("employer")}>
            Hiring workspace
          </a>
        </nav>

        <div className={styles.split}>
          <section className={styles.sectionAnchor} id="profile-settings">
            <ProfileAccountDetailsCard
              initialCountryCode={context.aggregate.talentIdentity.country_code}
              initialDisplayName={context.user.fullName || context.aggregate.talentIdentity.display_name}
              initialEmail={context.user.email}
              initialFirstName={context.user.firstName}
              initialLastName={context.user.lastName}
              initialPhoneOptional={context.aggregate.talentIdentity.phone_optional}
              readOnlyRows={[
                { label: "Career AI ID", value: context.aggregate.talentIdentity.talent_agent_id, isIdentifier: true },
                { label: "Role", value: context.onboarding.roleType ?? "Recruiter" },
              ]}
              signInSupport={
                context.user.authProvider === "google"
                  ? {
                      title: "No separate Career AI password yet",
                      description:
                        "Because you signed in with Google, password changes, recovery options, and 2-Step Verification still live in your Google account settings.",
                      links: [
                        {
                          href: "https://myaccount.google.com/",
                          label: "Manage Google account",
                        },
                        {
                          href: "https://myaccount.google.com/security",
                          label: "Open Google security",
                        },
                      ],
                    }
                  : undefined
              }
            />
          </section>

          <section className={styles.sectionAnchor} id="alert-settings">
            <CandidateNotificationPreferencesCard
              initialPhoneOptional={context.aggregate.talentIdentity.phone_optional}
              initialPreferences={notificationPreferences}
            />
          </section>
        </div>

        <section className={styles.sectionAnchor} id="application-profile-settings">
          <ApplicationProfileSettingsCard />
        </section>
      </div>
    </main>
  );
}
