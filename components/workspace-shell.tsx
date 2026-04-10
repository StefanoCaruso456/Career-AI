"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { WorkspaceNavItem } from "@/lib/workspace-navigation";
import styles from "./workspace-shell.module.css";

function isCurrentPath(pathname: string, tab: WorkspaceNavItem) {
  if (tab.match === "exact") {
    return pathname === tab.href;
  }

  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function WorkspaceShell({
  children,
  eyebrow,
  summary,
  tabs,
}: {
  children: ReactNode;
  eyebrow: string;
  summary: string;
  tabs: WorkspaceNavItem[];
}) {
  const pathname = usePathname();

  return (
    <>
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.copyBlock}>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <p className={styles.summary}>{summary}</p>
          </div>

          <nav aria-label={`${eyebrow} navigation`} className={styles.tabBar}>
            {tabs.map((tab) => {
              const isCurrent = isCurrentPath(pathname, tab);

              return (
                <Link
                  aria-current={isCurrent ? "page" : undefined}
                  className={isCurrent ? `${styles.tab} ${styles.tabCurrent}` : styles.tab}
                  href={tab.href}
                  key={tab.href}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      {children}
    </>
  );
}
