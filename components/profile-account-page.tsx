import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, UserRound } from "lucide-react";
import { getDisplayNameForContext } from "@/auth-identity";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { ProfileAccountDetailsCard } from "@/components/profile-account-details-card";
import { getPostAuthRoute, personaConfigs, type Persona } from "@/lib/personas";
import type { PersistentTalentIdentityContext } from "@/packages/persistence/src";
import styles from "@/app/settings/page.module.css";

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

function getAccountTypeLabel(roleType: string | null | undefined, preferredPersona: Persona) {
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

export function ProfileAccountPage({
  context,
  preferredPersona,
}: {
  context: PersistentTalentIdentityContext;
  preferredPersona: Persona;
}) {
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

  const readOnlyAccountRows = [
    { label: "Account type", value: accountTypeLabel },
    ...(roleLabel ? [{ label: "Role", value: roleLabel }] : []),
    { label: "Destination", value: destinationLabel },
    { label: "Setup", value: setupLabel },
    { label: "Workspace", value: personaConfig.workspaceLabel },
    { label: "Sign-in", value: providerLabel },
    { label: "Last sign-in", value: formatTimestamp(context.user.lastLoginAt) },
    {
      label: "Career AI ID",
      isIdentifier: true,
      value: context.aggregate.talentIdentity.talent_agent_id,
    },
  ];

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
          <ProfileAccountDetailsCard
            initialCountryCode={context.aggregate.talentIdentity.country_code}
            initialDisplayName={displayName}
            initialEmail={email}
            initialFirstName={context.user.firstName}
            initialLastName={context.user.lastName}
            initialPhoneOptional={context.aggregate.talentIdentity.phone_optional}
            readOnlyRows={readOnlyAccountRows}
          />
        </section>
      </div>
    </main>
  );
}
