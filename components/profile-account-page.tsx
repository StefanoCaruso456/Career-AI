import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { getDisplayNameForContext } from "@/auth-identity";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { getPostAuthRoute, personaConfigs, type Persona } from "@/lib/personas";
import type { PersistentTalentIdentityContext } from "@/packages/persistence/src";
import styles from "@/app/settings/page.module.css";

function getFirstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] ?? "there";
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getAccountTypeCopy(roleType: string | null | undefined, preferredPersona: Persona) {
  if (roleType === "candidate") {
    return {
      description:
        "This user signed up as a job seeker and will move through the candidate-facing Career AI experience.",
      label: "Job seeker",
    };
  }

  if (roleType === "recruiter") {
    return {
      description:
        "This user signed up as a recruiter and will move through the employer-side hiring experience.",
      label: "Employer",
    };
  }

  if (roleType === "hiring_manager") {
    return {
      description:
        "This user signed up as a hiring manager and will move through the employer-side hiring experience.",
      label: "Employer",
    };
  }

  return {
    description: personaConfigs[preferredPersona].description,
    label: personaConfigs[preferredPersona].shortLabel,
  };
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
  const accountTypeCopy = getAccountTypeCopy(context.onboarding.roleType, preferredPersona);
  const isOnboardingComplete = context.onboarding.status === "completed";
  const primaryHref = isOnboardingComplete ? getPostAuthRoute(preferredPersona) : "/onboarding";
  const primaryLabel = isOnboardingComplete ? "Open workspace" : "Finish onboarding";
  const primaryDescription = isOnboardingComplete
    ? `Continue into the ${personaConfig.workspaceLabel.toLowerCase()} this account is currently using.`
    : `Resume setup at step ${context.onboarding.currentStep} of 4 and complete the persistent account profile.`;

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
                  height={96}
                  src={context.user.imageUrl}
                  width={96}
                />
              ) : (
                <div className={styles.avatarFallback}>
                  <UserRound aria-hidden="true" size={40} strokeWidth={1.8} />
                </div>
              )}
            </div>

            <div className={styles.identityCopy}>
              <span className={styles.eyebrow}>Profile & account</span>
              <h1 className={styles.title}>Settings</h1>
              <p className={styles.subtitle}>
                {getFirstName(displayName)}, this workspace now shows the identity details,
                security controls, and role-specific account metadata users expect in a
                modern SaaS profile surface.
              </p>

              <div className={styles.statusRow}>
                <span className={styles.statusPill}>
                  <ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />
                  Google verified
                </span>
                <span className={styles.statusPill}>
                  <BriefcaseBusiness aria-hidden="true" size={16} strokeWidth={2} />
                  {accountTypeCopy.label}
                </span>
                <span className={styles.statusPill}>
                  <Sparkles aria-hidden="true" size={16} strokeWidth={2} />
                  {isOnboardingComplete
                    ? "Onboarding complete"
                    : `Step ${context.onboarding.currentStep} of 4`}
                </span>
              </div>
            </div>
          </div>

          <aside className={styles.heroPanel}>
            <span className={styles.heroPanelLabel}>Current destination</span>
            <strong>{isOnboardingComplete ? personaConfig.workspaceLabel : "Finish onboarding"}</strong>
            <p>{primaryDescription}</p>
            <Link className={styles.primaryLink} href={primaryHref}>
              {primaryLabel}
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </aside>
        </section>

        <section className={styles.grid}>
          <article className={`${styles.panel} ${styles.profilePanel}`}>
            <div className={styles.panelHeader}>
              <h2>Profile</h2>
              <p>Core identity details surfaced directly inside Career AI.</p>
            </div>

            <dl className={styles.details}>
              <div>
                <dt>Display name</dt>
                <dd>{displayName}</dd>
              </div>
              <div>
                <dt>Primary email</dt>
                <dd>{email}</dd>
              </div>
              <div>
                <dt>Account type</dt>
                <dd>{accountTypeCopy.label}</dd>
              </div>
              <div>
                <dt>Current experience</dt>
                <dd>{personaConfig.workspaceLabel}</dd>
              </div>
              <div>
                <dt>Authentication provider</dt>
                <dd>{context.user.authProvider}</dd>
              </div>
              <div>
                <dt>Last sign-in</dt>
                <dd>{formatTimestamp(context.user.lastLoginAt)}</dd>
              </div>
              <div>
                <dt>Career AI ID</dt>
                <dd>{context.aggregate.talentIdentity.talent_agent_id}</dd>
              </div>
            </dl>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Sign-in & security</h2>
              <p>
                Email and password controls are routed to the identity provider that actually
                owns them today.
              </p>
            </div>

            <div className={styles.securityList}>
              <div className={styles.securityRow}>
                <Mail aria-hidden="true" size={18} strokeWidth={2} />
                <div>
                  <strong>Review your account email</strong>
                  <span>
                    Users can always see the Google-backed email address attached to this
                    Career AI account.
                  </span>
                </div>
              </div>

              <div className={styles.securityRow}>
                <KeyRound aria-hidden="true" size={18} strokeWidth={2} />
                <div>
                  <strong>Change password in Google</strong>
                  <span>
                    Because sign-in is OAuth-only right now, password updates, recovery
                    options, and 2-Step Verification stay in Google security settings.
                  </span>
                </div>
              </div>

              <div className={styles.securityRow}>
                <ShieldCheck aria-hidden="true" size={18} strokeWidth={2} />
                <div>
                  <strong>Verified email source of truth</strong>
                  <span>
                    Career AI reads the verified Google identity instead of asking users to
                    manage duplicate credentials.
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.actionStack}>
              <a
                className={styles.secondaryLink}
                href="https://myaccount.google.com/"
                rel="noreferrer"
                target="_blank"
              >
                Manage Google account
                <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
              </a>
              <a
                className={styles.secondaryLink}
                href="https://myaccount.google.com/security"
                rel="noreferrer"
                target="_blank"
              >
                Open Google security
                <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
              </a>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Account experience</h2>
              <p>
                Role selection affects routing, messaging, and the product surface users see
                after sign-in.
              </p>
            </div>

            <div className={styles.accountTypeCard}>
              <span className={styles.accountTypeBadge}>{personaConfig.shortLabel}</span>
              <strong>{accountTypeCopy.label} account</strong>
              <p>{accountTypeCopy.description}</p>
            </div>

            <ul className={styles.guidanceList}>
              <li>Declared role: {context.onboarding.roleType ?? "Not selected yet"}</li>
              <li>Onboarding progress: {context.onboarding.profileCompletionPercent}% complete</li>
              <li>Current experience: {personaConfig.shortLabel}</li>
              <li>
                If the user needs a different Google email, sign out and continue with the
                Google account they want to use for Career AI.
              </li>
            </ul>

            <Link className={styles.inlineLink} href={primaryHref}>
              {primaryLabel}
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </article>
        </section>
      </div>
    </main>
  );
}
