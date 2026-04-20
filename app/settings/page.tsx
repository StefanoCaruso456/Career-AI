import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { auth } from "@/auth";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import {
  getAuthenticatedWorkspaceHref,
  hasIncompleteOnboarding,
} from "@/lib/authenticated-workspace";
import { getPersonaSignInRoute, personaConfigs } from "@/lib/personas";
import { getServerPreferredPersona } from "@/lib/server-persona-preference";
import styles from "./page.module.css";

function getDisplayName(name: string | null | undefined, email: string | null | undefined) {
  if (name?.trim()) {
    return name.trim();
  }

  if (email?.trim()) {
    return email.split("@")[0];
  }

  return "Career AI user";
}

function getFirstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] ?? "there";
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

  const displayName = getDisplayName(session.user.name, session.user.email);
  const email = session.user.email ?? "Google account email unavailable";
  const personaConfig = personaConfigs[preferredPersona];
  const shouldResumeOnboarding = hasIncompleteOnboarding(session.user.onboardingStatus);
  const workspaceHref = getAuthenticatedWorkspaceHref({
    onboardingStatus: session.user.onboardingStatus,
    persona: preferredPersona,
  });

  return (
    <main className={styles.page}>
      <PersonaPreferenceSync persona={preferredPersona} />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.identityBlock}>
            <div className={styles.avatarShell}>
              {session.user.image ? (
                <Image
                  alt={`${displayName} profile image`}
                  className={styles.avatar}
                  height={96}
                  src={session.user.image}
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
                  {personaConfig.shortLabel}
                </span>
                <span className={styles.statusPill}>
                  <Sparkles aria-hidden="true" size={16} strokeWidth={2} />
                  OAuth account
                </span>
              </div>
            </div>
          </div>

          <aside className={styles.heroPanel}>
            <span className={styles.heroPanelLabel}>Current experience</span>
            <strong>{personaConfig.workspaceLabel}</strong>
            <p>
              Account type is chosen at sign-up and drives whether this user lands in the job
              seeker or employer workflow after authentication.
            </p>
            <Link className={styles.primaryLink} href={workspaceHref}>
              {shouldResumeOnboarding ? "Finish onboarding" : "Open workspace"}
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
                <dt>Authentication provider</dt>
                <dd>Google OAuth</dd>
              </div>
              <div>
                <dt>Account type</dt>
                <dd>{personaConfig.shortLabel}</dd>
              </div>
              <div>
                <dt>Workspace access</dt>
                <dd>{personaConfig.workspaceLabel}</dd>
              </div>
              <div>
                <dt>Email status</dt>
                <dd>Verified by Google</dd>
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
              <strong>{personaConfig.workspaceLabel}</strong>
              <p>{personaConfig.description}</p>
            </div>

            <ul className={styles.guidanceList}>
              <li>This role is chosen during sign-up and reused for the authenticated experience.</li>
              <li>Job seeker and employer accounts can have different onboarding, copy, and workflows.</li>
              <li>
                If the user needs a different Google email, sign out and continue with the
                Google account they want to use for Career AI.
              </li>
            </ul>

            <Link className={styles.inlineLink} href={workspaceHref}>
              {shouldResumeOnboarding
                ? "Return to onboarding"
                : `Return to ${personaConfig.workspaceLabel.toLowerCase()}`}
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </article>
        </section>
      </div>
    </main>
  );
}
