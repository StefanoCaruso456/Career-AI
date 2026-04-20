"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { AuthModalTrigger } from "./auth-modal";
import {
  getAuthenticatedWorkspaceHref,
  hasIncompleteOnboarding,
} from "@/lib/authenticated-workspace";
import { readPreferredPersona } from "@/lib/persona-preference";
import {
  defaultPersona,
  getPersonaFromRoute,
  getSettingsRoute,
  personaConfigs,
  resolveActivePersona,
  type Persona,
} from "@/lib/personas";
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
}: {
  googleOAuthEnabled?: boolean;
} = {}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [preferredPersona, setPreferredPersona] = useState<Persona>(defaultPersona);

  useEffect(() => {
    setPreferredPersona(getPersonaFromRoute(pathname) ?? readPreferredPersona());
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

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
          googleOAuthEnabled={googleOAuthEnabled}
          label="Getting Started"
        />
      </div>
    );
  }

  const displayName = getDisplayName(session.user.name, session.user.email);
  const initials = getInitials(session.user.name, session.user.email);
  const activePersona = resolveActivePersona({
    preferredPersona,
    roleType: session.user.roleType,
    route: pathname,
  });
  const shouldResumeOnboarding = hasIncompleteOnboarding(session.user.onboardingStatus);
  const workspaceHref = getAuthenticatedWorkspaceHref({
    onboardingStatus: session.user.onboardingStatus,
    persona: activePersona,
  });
  const workspaceLabel = shouldResumeOnboarding
    ? `${personaConfigs[activePersona].shortLabel} setup`
    : personaConfigs[activePersona].workspaceLabel;
  const accountTypeLabel = personaConfigs[activePersona].shortLabel;
  const accountTypeDescription = shouldResumeOnboarding
    ? session.user.currentStep
      ? `Finish step ${session.user.currentStep} of 4 to unlock the full ${personaConfigs[activePersona].workspaceLabel.toLowerCase()}.`
      : `Finish onboarding to unlock the full ${personaConfigs[activePersona].workspaceLabel.toLowerCase()}.`
    : personaConfigs[activePersona].description;

  return (
    <div className={styles.actions}>
      <div className={styles.accountMenuShell} ref={menuRef}>
        <button
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          className={[styles.accountAction, isMenuOpen ? styles.accountActionOpen : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            setIsMenuOpen((currentValue) => !currentValue);
          }}
          type="button"
        >
          <span aria-hidden="true" className={styles.accountAvatar}>
            {initials}
          </span>
          <span className={styles.accountCopy}>
            <strong>Settings</strong>
            <small>{displayName}</small>
          </span>
          <Settings2
            aria-hidden="true"
            className={styles.accountActionIcon}
            size={16}
            strokeWidth={2}
          />
          {isMenuOpen ? (
            <ChevronUp
              aria-hidden="true"
              className={styles.accountActionIcon}
              size={18}
              strokeWidth={2.1}
            />
          ) : (
            <ChevronDown
              aria-hidden="true"
              className={styles.accountActionIcon}
              size={18}
              strokeWidth={2.1}
            />
          )}
        </button>

        {isMenuOpen ? (
          <div className={styles.accountMenu} role="menu">
            <div className={styles.accountMenuProfile}>
              <div className={styles.accountMenuIdentity}>
                <span aria-hidden="true" className={styles.accountMenuAvatar}>
                  {initials}
                </span>
                <div className={styles.accountMenuCopyBlock}>
                  <strong>{displayName}</strong>
                  <span>{session.user.email ?? "Google account email unavailable"}</span>
                </div>
              </div>
              <span className={styles.accountMenuBadge}>{accountTypeLabel}</span>
              <p className={styles.accountMenuDescription}>{accountTypeDescription}</p>
            </div>

            <div className={styles.accountMenuDivider} />

            <Link
              className={styles.accountMenuAction}
              href={getSettingsRoute(activePersona)}
              onClick={() => {
                setIsMenuOpen(false);
              }}
              role="menuitem"
            >
              <UserRound aria-hidden="true" size={18} strokeWidth={2} />
              <span className={styles.accountMenuActionCopy}>
                <strong>Profile & account</strong>
                <small>Review your name, email, security method, and account type.</small>
              </span>
            </Link>

            <Link
              className={styles.accountMenuAction}
              href={workspaceHref}
              onClick={() => {
                setIsMenuOpen(false);
              }}
              role="menuitem"
            >
              <LayoutDashboard aria-hidden="true" size={18} strokeWidth={2} />
              <span className={styles.accountMenuActionCopy}>
                <strong>{shouldResumeOnboarding ? "Finish onboarding" : "Open workspace"}</strong>
                <small>
                  {shouldResumeOnboarding
                    ? "Return to onboarding and complete your remaining setup steps."
                    : `Return to the ${workspaceLabel.toLowerCase()} you selected for this account.`}
                </small>
              </span>
            </Link>

            <div className={styles.accountMenuHint}>
              <ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />
              <span>Google manages the verified email and password for this account today.</span>
            </div>

            <button
              className={`${styles.accountMenuAction} ${styles.accountMenuDanger}`}
              onClick={() => {
                setIsMenuOpen(false);
                void signOut({ callbackUrl: "/" });
              }}
              role="menuitem"
              type="button"
            >
              <LogOut aria-hidden="true" size={18} strokeWidth={2} />
              <span className={styles.accountMenuActionCopy}>
                <strong>Sign out</strong>
                <small>End this session and return to the public Career AI homepage.</small>
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
