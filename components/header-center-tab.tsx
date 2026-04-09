"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./floating-site-header.module.css";

export function HeaderCenterTab() {
  const pathname = usePathname();
  const isAgentBuild =
    pathname === "/agent-build" || pathname.startsWith("/agent-build/");

  return (
    <div className={styles.centerNav}>
      <Link
        aria-current={isAgentBuild ? "page" : undefined}
        className={isAgentBuild ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
        href="/agent-build"
      >
        Agent Build
      </Link>
    </div>
  );
}
