import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  ensurePersistentCareerIdentityForSessionUser,
  getDisplayNameForContext,
} from "@/auth-identity";
import { resolveOnboardingStep } from "@/packages/onboarding/src";
import {
  submitBasicProfile,
  submitCareerProfileBasics,
  submitOnboardingCompletion,
  submitRoleSelection,
} from "./actions";
import styles from "./page.module.css";

const roleOptions = [
  {
    value: "candidate",
    label: "Candidate",
    description: "You are building a career profile to advance your own opportunities.",
  },
  {
    value: "recruiter",
    label: "Recruiter",
    description: "You review candidates and need structured identity and trust signals.",
  },
  {
    value: "hiring_manager",
    label: "Hiring manager",
    description: "You evaluate talent and want evidence-backed hiring context.",
  },
] as const;

type OnboardingProfile = {
  headline?: string;
  intent?: string;
  location?: string;
};

function getStepTitle(step: number) {
  if (step === 1) {
    return "Confirm your profile";
  }

  if (step === 2) {
    return "Choose your role";
  }

  if (step === 3) {
    return "Add career basics";
  }

  return "Complete onboarding";
}

function getStepCopy(step: number) {
  if (step === 1) {
    return "We start with the durable profile fields that will power your account, identity records, and future trust workflows.";
  }

  if (step === 2) {
    return "Choose the mode that best matches how you use Career AI today. You can expand this later.";
  }

  if (step === 3) {
    return "Capture the high-level career context we should persist and carry across sessions.";
  }

  return "Your onboarding state is now durable. Finish setup and move into the authenticated app experience.";
}

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
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
    correlationId: `onboarding_page_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
  });

  if (context.onboarding.status === "completed") {
    redirect("/account");
  }

  const currentStep = resolveOnboardingStep(context);
  const profile = context.onboarding.profile as OnboardingProfile;
  const displayName = getDisplayNameForContext(context);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Persistent onboarding</p>
            <h1 className={styles.title}>{getStepTitle(currentStep)}</h1>
            <p className={styles.copy}>{getStepCopy(currentStep)}</p>
          </div>

          <div className={styles.progressCard}>
            <span className={styles.progressLabel}>Profile completion</span>
            <strong className={styles.progressValue}>
              {context.onboarding.profileCompletionPercent}%
            </strong>
            <div className={styles.progressTrack} aria-hidden="true">
              <span
                className={styles.progressFill}
                style={{ width: `${context.onboarding.profileCompletionPercent}%` }}
              />
            </div>
            <p className={styles.progressMeta}>
              Signed in as {displayName} · step {currentStep} of 4
            </p>
          </div>
        </section>

        <section className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarCard}>
              <h2>Flow</h2>
              <ol className={styles.stepList}>
                <li data-active={currentStep === 1}>Basic profile confirmation</li>
                <li data-active={currentStep === 2}>Role or persona selection</li>
                <li data-active={currentStep === 3}>Career profile basics</li>
                <li data-active={currentStep === 4}>Completion</li>
              </ol>
            </div>
          </aside>

          <section className={styles.panel}>
            {currentStep === 1 ? (
              <form action={submitBasicProfile} className={styles.form}>
                <label className={styles.field}>
                  <span>First name</span>
                  <input defaultValue={context.user.firstName} name="firstName" required type="text" />
                </label>
                <label className={styles.field}>
                  <span>Last name</span>
                  <input defaultValue={context.user.lastName} name="lastName" required type="text" />
                </label>
                <button className={styles.primaryAction} type="submit">
                  Save and continue
                </button>
              </form>
            ) : null}

            {currentStep === 2 ? (
              <form action={submitRoleSelection} className={styles.form}>
                <div className={styles.choiceGrid}>
                  {roleOptions.map((option) => (
                    <label className={styles.choiceCard} key={option.value}>
                      <input
                        defaultChecked={context.onboarding.roleType === option.value}
                        name="roleType"
                        required
                        type="radio"
                        value={option.value}
                      />
                      <span className={styles.choiceLabel}>{option.label}</span>
                      <span className={styles.choiceCopy}>{option.description}</span>
                    </label>
                  ))}
                </div>
                <button className={styles.primaryAction} type="submit">
                  Save role
                </button>
              </form>
            ) : null}

            {currentStep === 3 ? (
              <form action={submitCareerProfileBasics} className={styles.form}>
                <label className={styles.field}>
                  <span>Career headline</span>
                  <input
                    defaultValue={profile.headline ?? ""}
                    name="headline"
                    placeholder="Senior product designer exploring AI-native hiring systems"
                    required
                    type="text"
                  />
                </label>
                <label className={styles.field}>
                  <span>Location</span>
                  <input
                    defaultValue={profile.location ?? ""}
                    name="location"
                    placeholder="Chicago, IL"
                    required
                    type="text"
                  />
                </label>
                <label className={styles.field}>
                  <span>Current intent</span>
                  <textarea
                    defaultValue={profile.intent ?? ""}
                    name="intent"
                    placeholder="I want to keep a durable, verified career profile ready for recruiters."
                    required
                    rows={5}
                  />
                </label>
                <button className={styles.primaryAction} type="submit">
                  Save career basics
                </button>
              </form>
            ) : null}

            {currentStep === 4 ? (
              <form action={submitOnboardingCompletion} className={styles.form}>
                <div className={styles.summaryCard}>
                  <h2>Ready to launch</h2>
                  <ul className={styles.summaryList}>
                    <li>User record is stored durably in Railway Postgres.</li>
                    <li>Career identity, privacy settings, and soul record are linked and persisted.</li>
                    <li>Your onboarding progress will survive refresh, logout, and redeploy.</li>
                  </ul>
                </div>
                <button className={styles.primaryAction} type="submit">
                  Finish onboarding
                </button>
              </form>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}
