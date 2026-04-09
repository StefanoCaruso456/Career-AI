"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./floating-site-header.module.css";

export function HeaderCenterTab() {
  const pathname = usePathname();
  const isAgentBuild =
    pathname === "/agent-build" || pathname.startsWith("/agent-build/");
  const isJobs = pathname === "/jobs" || pathname.startsWith("/jobs/");

  return (
    <div className={styles.centerNav}>
      <Link
        aria-current={isAgentBuild ? "page" : undefined}
        className={isAgentBuild ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
        href="/agent-build"
      >
        Agent Builder
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
