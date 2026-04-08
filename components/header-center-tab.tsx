"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./floating-site-header.module.css";

export function HeaderCenterTab() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <div className={styles.centerNav}>
      <Link
        aria-current={isHome ? "page" : undefined}
        className={isHome ? `${styles.navTab} ${styles.navTabCurrent}` : styles.navTab}
        href="/"
      >
        Agent Build
      </Link>
    </div>
  );
}
