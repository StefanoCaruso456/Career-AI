"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard, LoaderCircle, LogOut, Settings2 } from "lucide-react";
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
  const accountLabel = shouldResumeOnboarding ? "Finish onboarding" : displayName;
  const accountMeta = shouldResumeOnboarding
    ? session.user.currentStep
      ? `Step ${session.user.currentStep} of 4`
      : "Resume setup"
    : preferredPersona === "employer"
      ? personaConfigs.employer.workspaceLabel
      : session.user.talentAgentId ?? "Google connected";
  const accountMenuLabel = shouldResumeOnboarding
    ? "Finish onboarding"
    : preferredPersona === "employer"
      ? personaConfigs.employer.workspaceLabel
      : "Profile";

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
            <strong>Settings</strong>
            <small>{displayName}</small>
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
            <div className={styles.settingsPanelHeader}>
              <span className={styles.settingsPanelTitle}>{accountLabel}</span>
              <span className={styles.settingsPanelMeta}>{accountMeta}</span>
            </div>

            <Link
              aria-current={isAccountPage ? "page" : undefined}
              className={
                isAccountPage
                  ? `${styles.settingsItem} ${styles.settingsItemCurrent}`
                  : styles.settingsItem
              }
              href={accountHref}
              onClick={() => {
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              <LayoutDashboard aria-hidden="true" size={16} strokeWidth={2} />
              <span>{accountMenuLabel}</span>
            </Link>

            <button
              className={styles.settingsItem}
              onClick={() => {
                setMenuOpen(false);
                void signOut({ callbackUrl: "/" });
              }}
              role="menuitem"
              type="button"
            >
              <LogOut aria-hidden="true" size={16} strokeWidth={2} />
              <span>Sign out</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
