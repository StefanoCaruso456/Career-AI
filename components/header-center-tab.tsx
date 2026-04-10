"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./floating-site-header.module.css";

export function HeaderCenterTab() {
  const pathname = usePathname();
  const isAccount = pathname === "/account" || pathname.startsWith("/account/");
  const isEmployer = pathname === "/employer" || pathname.startsWith("/employer/");
  const isAgentBuild =
    pathname === "/agent-build" || pathname.startsWith("/agent-build/");
  const isJobs = pathname === "/jobs" || pathname.startsWith("/jobs/");

  if (isAccount || isEmployer) {
    return null;
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
