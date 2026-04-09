"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LoaderCircle, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { AuthModalTrigger } from "./auth-modal";
import styles from "./floating-site-header.module.css";

function getDisplayName(name: string | null | undefined, email: string | null | undefined) {
  if (name?.trim()) {
    return name.trim();
  }

  if (email?.trim()) {
    return email.split("@")[0];
  }

  return "Account";
}

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  const displayName = getDisplayName(name, email);
  const parts = displayName.split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "TA";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function HeaderAuthControls() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const shouldResumeOnboarding =
    session?.user?.onboardingStatus !== null &&
    session?.user?.onboardingStatus !== undefined &&
    session.user.onboardingStatus !== "completed";
  const accountHref = shouldResumeOnboarding ? "/onboarding" : "/account";
  const isAccountPage =
    accountHref === "/account"
      ? pathname === "/account" || pathname.startsWith("/account/")
      : pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  if (status === "loading") {
    return (
      <div className={styles.actions}>
        <span className={`${styles.ghostAction} ${styles.loadingAction}`}>
          <LoaderCircle className={styles.inlineSpinner} size={16} strokeWidth={2} />
          Checking session
        </span>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className={styles.actions}>
        <AuthModalTrigger
          className={styles.primaryAction}
          defaultMode="signup"
          label="Getting Started"
        />
      </div>
    );
  }

  const displayName = getDisplayName(session.user.name, session.user.email);
  const initials = getInitials(session.user.name, session.user.email);
  const accountLabel = shouldResumeOnboarding ? "Finish onboarding" : displayName;
  const accountMeta = shouldResumeOnboarding
    ? session.user.currentStep
      ? `Step ${session.user.currentStep} of 4`
      : "Resume setup"
    : session.user.talentAgentId ?? "Google connected";

  return (
    <div className={styles.actions}>
      <Link
        aria-current={isAccountPage ? "page" : undefined}
        className={
          isAccountPage
            ? `${styles.accountAction} ${styles.accountActionCurrent}`
            : styles.accountAction
        }
        href={accountHref}
      >
        <span className={styles.accountAvatar} aria-hidden="true">
          {initials}
        </span>
        <span className={styles.accountCopy}>
          <strong>{accountLabel}</strong>
          <small>{accountMeta}</small>
        </span>
        <LayoutDashboard aria-hidden="true" size={16} strokeWidth={2} />
      </Link>

      <button
        className={styles.ghostButton}
        onClick={() => {
          void signOut({ callbackUrl: "/" });
        }}
        type="button"
      >
        <LogOut aria-hidden="true" size={16} strokeWidth={2} />
        Sign out
      </button>
    </div>
  );
}
