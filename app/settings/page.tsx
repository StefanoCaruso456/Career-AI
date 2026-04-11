import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { auth } from "@/auth";
import {
  ensurePersistentCareerIdentityForSessionUser,
  getDisplayNameForContext,
} from "@/auth-identity";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { getPersonaSignInRoute, getPostAuthRoute, personaConfigs } from "@/lib/personas";
import { getServerPreferredPersona } from "@/lib/server-persona-preference";
import styles from "./page.module.css";

function getFirstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] ?? "there";
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getAccountTypeCopy(roleType: string | null | undefined, preferredPersona: keyof typeof personaConfigs) {
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
  const accountTypeCopy = getAccountTypeCopy(context.onboarding.roleType, preferredPersona);
  const isOnboardingComplete = context.onboarding.status === "completed";
  const primaryHref = isOnboardingComplete ? getPostAuthRoute(preferredPersona) : "/onboarding";
  const primaryLabel = isOnboardingComplete ? "Open workspace" : "Finish onboarding";
  const onboardingStatusLabel = isOnboardingComplete
    ? "Completed"
    : `Step ${context.onboarding.currentStep} of 4`;
  const currentDestinationLabel = isOnboardingComplete
    ? personaConfig.workspaceLabel
    : "Finish onboarding";
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
                {getFirstName(displayName)}, this page keeps the useful account context in one
                place so profile details, onboarding state, and identity metadata are easy to
                scan without repeated cards.
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
            <p>
              {primaryDescription}
            </p>
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
                <dt>Declared role</dt>
                <dd>{context.onboarding.roleType ?? "Not selected yet"}</dd>
              </div>
              <div>
                <dt>Current experience</dt>
                <dd>{personaConfig.workspaceLabel}</dd>
              </div>
              <div>
                <dt>Current destination</dt>
                <dd>{currentDestinationLabel}</dd>
              </div>
              <div>
                <dt>Onboarding status</dt>
                <dd>{onboardingStatusLabel}</dd>
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

            <div className={styles.profileFooter}>
              <p className={styles.profileFootnote}>
                Credentials and recovery still live in Google, so Career AI only shows the
                linked account context here.
              </p>

              <div className={styles.profileLinks}>
                <a
                  className={styles.inlineLink}
                  href="https://myaccount.google.com/"
                  rel="noreferrer"
                  target="_blank"
                >
                  Google account
                  <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
                </a>
                <a
                  className={styles.inlineLink}
                  href="https://myaccount.google.com/security"
                  rel="noreferrer"
                  target="_blank"
                >
                  Google security
                  <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
                </a>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
