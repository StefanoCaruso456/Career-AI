"use client";

import Link from "next/link";
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

export function HeaderAuthControls({
  googleOAuthEnabled,
  productionOrigin,
  productionRedirectUri,
}: {
  googleOAuthEnabled: boolean;
  productionOrigin: string;
  productionRedirectUri: string;
}) {
  const { data: session, status } = useSession();

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
          className={styles.ghostAction}
          defaultMode="signin"
          googleOAuthEnabled={googleOAuthEnabled}
          label="Sign in"
          productionOrigin={productionOrigin}
          productionRedirectUri={productionRedirectUri}
        />
        <Link className={styles.primaryAction} href="/#footer">
          Contact sales
        </Link>
      </div>
    );
  }

  const displayName = getDisplayName(session.user.name, session.user.email);
  const initials = getInitials(session.user.name, session.user.email);

  return (
    <div className={styles.actions}>
      <Link className={styles.accountAction} href="/account">
        <span className={styles.accountAvatar} aria-hidden="true">
          {initials}
        </span>
        <span className={styles.accountCopy}>
          <strong>{displayName}</strong>
          <small>Google connected</small>
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
