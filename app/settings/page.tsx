import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, KeyRound, Mail, UserRound } from "lucide-react";
import { auth } from "@/auth";
import {
  ensurePersistentCareerIdentityForSessionUser,
  getDisplayNameForContext,
} from "@/auth-identity";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { getPersonaSignInRoute, getPostAuthRoute, personaConfigs } from "@/lib/personas";
import { getServerPreferredPersona } from "@/lib/server-persona-preference";
import styles from "./page.module.css";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatProviderLabel(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return value
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function getAccountTypeLabel(
  roleType: string | null | undefined,
  preferredPersona: keyof typeof personaConfigs,
) {
  if (roleType === "candidate") {
    return "Job seeker";
  }

  if (roleType === "recruiter" || roleType === "hiring_manager") {
    return "Employer";
  }

  return personaConfigs[preferredPersona].shortLabel;
}

function getRoleLabel(roleType: string | null | undefined) {
  if (roleType === "candidate") {
    return "Candidate";
  }

  if (roleType === "recruiter") {
    return "Recruiter";
  }

  if (roleType === "hiring_manager") {
    return "Hiring manager";
  }

  return null;
}

export default async function SettingsPage() {
  const preferredPersona = await getServerPreferredPersona();
  const session = await auth();

  if (!session?.user) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: "/settings",
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

  const displayName = getDisplayNameForContext(context);
  const email = context.user.email;
  const personaConfig = personaConfigs[preferredPersona];
  const accountTypeLabel = getAccountTypeLabel(context.onboarding.roleType, preferredPersona);
  const providerLabel = formatProviderLabel(context.user.authProvider);
  const roleLabel = getRoleLabel(context.onboarding.roleType);
  const isOnboardingComplete = context.onboarding.status === "completed";
  const setupLabel = isOnboardingComplete
    ? "Complete"
    : `Step ${context.onboarding.currentStep} of 4`;
  const destinationLabel = isOnboardingComplete ? personaConfig.workspaceLabel : "Onboarding";
  const primaryHref = isOnboardingComplete ? getPostAuthRoute(preferredPersona) : "/onboarding";
  const primaryLabel = isOnboardingComplete ? "Open workspace" : "Finish onboarding";

  const accountRows = [
    { label: "Display name", value: displayName },
    { label: "Email", value: email },
    { label: "Sign-in", value: providerLabel },
    { label: "Last sign-in", value: formatTimestamp(context.user.lastLoginAt) },
    {
      className: styles.identifierValue,
      label: "Career AI ID",
      value: context.aggregate.talentIdentity.talent_agent_id,
    },
  ];

  const accessRows = [
    { label: "Account type", value: accountTypeLabel },
    { label: "Destination", value: destinationLabel },
    { label: "Setup", value: setupLabel },
    { label: "Workspace", value: personaConfig.workspaceLabel },
  ];

  if (roleLabel) {
    accessRows.splice(1, 0, { label: "Role", value: roleLabel });
  }

  return (
    <main className={styles.page}>
      <PersonaPreferenceSync persona={preferredPersona} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.identityBlock}>
            <div className={styles.avatarShell}>
              {context.user.imageUrl ? (
                <Image
                  alt={`${displayName} profile image`}
                  className={styles.avatar}
                  height={84}
                  src={context.user.imageUrl}
                  width={84}
                />
              ) : (
                <div className={styles.avatarFallback}>
                  <UserRound aria-hidden="true" size={34} strokeWidth={1.8} />
                </div>
              )}
            </div>

            <div className={styles.identityCopy}>
              <span className={styles.eyebrow}>Settings</span>
              <h1 className={styles.title}>Profile &amp; account</h1>
              <div className={styles.identityMeta}>
                <strong>{displayName}</strong>
                <span>{email}</span>
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            <Link className={styles.primaryLink} href={primaryHref}>
              {primaryLabel}
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </div>
        </section>

        <section className={styles.summaryGrid} aria-label="Account summary">
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Account type</span>
            <strong className={styles.summaryValue}>{accountTypeLabel}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Destination</span>
            <strong className={styles.summaryValue}>{destinationLabel}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Setup</span>
            <strong className={styles.summaryValue}>{setupLabel}</strong>
          </article>
        </section>

        <section className={styles.contentGrid}>
          <article className={`${styles.panel} ${styles.detailsPanel}`}>
            <div className={styles.panelHeader}>
              <h2>Account details</h2>
            </div>

            <dl className={styles.detailList}>
              {accountRows.map((row) => (
                <div className={styles.detailRow} key={row.label}>
                  <dt>{row.label}</dt>
                  <dd className={row.className}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <div className={styles.sidebarStack}>
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Access</h2>
              </div>

              <dl className={styles.detailList}>
                {accessRows.map((row) => (
                  <div className={styles.detailRow} key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Security</h2>
              </div>

              <p className={styles.securityNote}>Credentials and recovery are managed by Google.</p>

              <div className={styles.actionStack}>
                <a
                  className={styles.secondaryLink}
                  href="https://myaccount.google.com/"
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className={styles.actionContent}>
                    <Mail aria-hidden="true" size={16} strokeWidth={2} />
                    Google account
                  </span>
                  <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
                </a>

                <a
                  className={styles.secondaryLink}
                  href="https://myaccount.google.com/security"
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className={styles.actionContent}>
                    <KeyRound aria-hidden="true" size={16} strokeWidth={2} />
                    Google security
                  </span>
                  <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
                </a>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
