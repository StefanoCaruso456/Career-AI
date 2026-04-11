"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Settings2,
  UserRound,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { AuthModalTrigger } from "./auth-modal";
import { readPreferredPersona } from "@/lib/persona-preference";
import {
  defaultPersona,
  getPersonaFromRoute,
  getPostAuthRoute,
  personaConfigs,
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

function getAccountTypeLabel(roleType: string | null | undefined, preferredPersona: Persona) {
  if (roleType === "candidate") {
    return "Job seeker";
  }

  if (roleType === "recruiter") {
    return "Employer";
  }

  if (roleType === "hiring_manager") {
    return "Employer";
  }

  return personaConfigs[preferredPersona].shortLabel;
}

export function HeaderAuthControls() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferredPersona, setPreferredPersona] = useState<Persona>(defaultPersona);
  const menuRef = useRef<HTMLDivElement>(null);
  const shouldResumeOnboarding =
    session?.user?.onboardingStatus !== null &&
    session?.user?.onboardingStatus !== undefined &&
    session.user.onboardingStatus !== "completed";
  const accountHref = shouldResumeOnboarding ? "/onboarding" : getPostAuthRoute(preferredPersona);
  const isAccountPage =
    accountHref === "/onboarding"
      ? pathname === "/onboarding" || pathname.startsWith("/onboarding/")
      : pathname === accountHref || pathname.startsWith(`${accountHref}/`);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setPreferredPersona(getPersonaFromRoute(pathname) ?? readPreferredPersona());
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

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
  const settingsHref = "/settings";
  const isSettingsPage = pathname === settingsHref || pathname.startsWith(`${settingsHref}/`);
  const workspaceHref = getPostAuthRoute(preferredPersona);
  const workspaceLabel = personaConfigs[preferredPersona].workspaceLabel;
  const accountTypeLabel = getAccountTypeLabel(session.user.roleType, preferredPersona);
  const accountLabel = shouldResumeOnboarding ? "Finish onboarding" : displayName;
  const accountMeta = shouldResumeOnboarding
    ? session.user.currentStep
      ? `Step ${session.user.currentStep} of 4`
      : "Resume setup"
    : workspaceLabel;
  const primaryMenuHref = shouldResumeOnboarding ? "/onboarding" : workspaceHref;
  const isPrimaryMenuPage =
    primaryMenuHref === "/onboarding"
      ? pathname === "/onboarding" || pathname.startsWith("/onboarding/")
      : pathname === primaryMenuHref || pathname.startsWith(`${primaryMenuHref}/`);
  const primaryMenuLabel = shouldResumeOnboarding ? "Finish onboarding" : "Workspace";

  return (
    <div className={styles.actions}>
      <div className={styles.settingsMenu} ref={menuRef}>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={
            menuOpen
              ? `${styles.settingsTrigger} ${styles.settingsTriggerOpen}`
              : styles.settingsTrigger
          }
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
          type="button"
        >
          <span className={styles.accountAvatar} aria-hidden="true">
            {initials}
          </span>
          <span className={styles.settingsCopy}>
            <strong>{accountLabel}</strong>
            <small>{accountMeta}</small>
          </span>
          <span className={styles.settingsIcons} aria-hidden="true">
            <Settings2 size={16} strokeWidth={2} />
            <ChevronDown
              className={menuOpen ? styles.settingsCaretOpen : undefined}
              size={16}
              strokeWidth={2}
            />
          </span>
        </button>

        {menuOpen ? (
          <div className={styles.settingsPanel} role="menu">
            <div className={styles.settingsPanelProfile}>
              <div className={styles.settingsPanelIdentity}>
                <span className={styles.settingsPanelAvatar} aria-hidden="true">
                  {initials}
                </span>
                <div className={styles.settingsPanelIdentityCopy}>
                  <strong>{displayName}</strong>
                  <span>{session.user.email ?? "Google account email unavailable"}</span>
                </div>
              </div>
              <span className={styles.settingsPanelBadge}>{accountTypeLabel}</span>
            </div>

            <div className={styles.settingsPanelDivider} />

            <Link
              aria-current={isPrimaryMenuPage ? "page" : undefined}
              className={
                isPrimaryMenuPage
                  ? `${styles.settingsItem} ${styles.settingsItemCurrent}`
                  : styles.settingsItem
              }
              href={primaryMenuHref}
              onClick={() => {
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              <span className={styles.settingsItemLead}>
                <LayoutDashboard aria-hidden="true" size={16} strokeWidth={2} />
                <span className={styles.settingsItemCopy}>
                  <strong>{primaryMenuLabel}</strong>
                </span>
              </span>
              <ChevronRight aria-hidden="true" className={styles.settingsItemArrow} size={16} strokeWidth={2} />
            </Link>

            <Link
              aria-current={isSettingsPage ? "page" : undefined}
              className={
                isSettingsPage
                  ? `${styles.settingsItem} ${styles.settingsItemCurrent}`
                  : styles.settingsItem
              }
              href={settingsHref}
              onClick={() => {
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              <span className={styles.settingsItemLead}>
                <UserRound aria-hidden="true" size={16} strokeWidth={2} />
                <span className={styles.settingsItemCopy}>
                  <strong>Profile & account</strong>
                </span>
              </span>
              <ChevronRight aria-hidden="true" className={styles.settingsItemArrow} size={16} strokeWidth={2} />
            </Link>

            <div className={styles.settingsPanelDivider} />

            <button
              className={`${styles.settingsItem} ${styles.settingsItemDanger}`}
              onClick={() => {
                setMenuOpen(false);
                void signOut({ callbackUrl: "/" });
              }}
              role="menuitem"
              type="button"
            >
              <span className={styles.settingsItemLead}>
                <LogOut aria-hidden="true" size={16} strokeWidth={2} />
                <span className={styles.settingsItemCopy}>
                  <strong>Sign out</strong>
                </span>
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
