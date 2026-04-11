"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPersonaFromRoute } from "@/lib/personas";
import styles from "./floating-site-header.module.css";

export function HeaderCenterTab() {
  const pathname = usePathname();
  const routePersona = getPersonaFromRoute(pathname);
  const isAccount = pathname === "/account" || pathname.startsWith("/account/");
  const isEmployerAgentSorcerer =
    pathname === "/employer/agent-sorcerer" ||
    pathname.startsWith("/employer/agent-sorcerer/");
  const isAgentBuild =
    pathname === "/agent-build" || pathname.startsWith("/agent-build/");
  const isJobs = pathname === "/jobs" || pathname.startsWith("/jobs/");

  if (routePersona === "job_seeker" && isAccount) {
    return null;
  }

  if (routePersona === "employer") {
    return (
      <div className={styles.centerNav}>
        <Link
          aria-current={isEmployerAgentSorcerer ? "page" : undefined}
          className={
            isEmployerAgentSorcerer
              ? `${styles.navTab} ${styles.navTabCurrent}`
              : styles.navTab
          }
          href="/employer/agent-sorcerer"
        >
          Agent Sorcerer
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.centerNav}>
      <Link
        aria-current={isAgentBuild ? "page" : undefined}
        className={isAgentBuild ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
        href="/agent-build"
      >
        Career ID
      </Link>
      <Link
        aria-current={isJobs ? "page" : undefined}
        className={isJobs ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
        href="/jobs"
      >
        Jobs
      </Link>
    </div>
  );
}
