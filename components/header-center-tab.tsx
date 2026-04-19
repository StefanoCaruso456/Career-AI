"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPersonaFromRoute } from "@/lib/personas";
import styles from "./floating-site-header.module.css";

export function HeaderCenterTab() {
  const pathname = usePathname();
  const routePersona = getPersonaFromRoute(pathname);
  const isEmployerCandidates =
    pathname === "/employer/candidates" ||
    pathname.startsWith("/employer/candidates/");
  const isAgentBuild =
    pathname === "/agent-build" || pathname.startsWith("/agent-build/");
  const isJobs = pathname === "/jobs" || pathname.startsWith("/jobs/");
  const isWallet = pathname === "/wallet" || pathname.startsWith("/wallet/");

  if (routePersona === "employer") {
    return (
      <div className={styles.centerNav}>
        <Link
          aria-current={isEmployerCandidates ? "page" : undefined}
          className={isEmployerCandidates ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
          href="/employer/candidates"
        >
          Candidates
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.centerNav}>
      <Link
        aria-current={isJobs ? "page" : undefined}
        className={isJobs ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
        href="/jobs"
      >
        Find Recruiters
      </Link>
      <Link
        aria-current={isAgentBuild ? "page" : undefined}
        className={isAgentBuild ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
        href="/agent-build"
      >
        Career ID
      </Link>
      <Link
        aria-current={isWallet ? "page" : undefined}
        className={isWallet ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
        href="/wallet"
      >
        Wallet
      </Link>
    </div>
  );
}
