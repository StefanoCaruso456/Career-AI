"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPersonaFromRoute, getPostAuthRoute } from "@/lib/personas";
import styles from "./floating-site-header.module.css";

export function HeaderHomeLink() {
  const pathname = usePathname();
  const routePersona = getPersonaFromRoute(pathname);
  const homeHref = routePersona ? getPostAuthRoute(routePersona) : "/";
  const isHome = pathname === homeHref;

  return (
    <Link
      aria-current={isHome ? "page" : undefined}
      aria-label="Career AI home"
      className={isHome ? `${styles.homeAction} ${styles.homeActionCurrent}` : styles.homeAction}
      href={homeHref}
    >
      <span className={styles.homeMarkShell} aria-hidden="true">
        <Image
          alt=""
          className={styles.homeMarkImage}
          fill
          priority
          sizes="44px"
          src="/career-ai-header-logo.png"
        />
      </span>
      <span className={styles.homeBrandCopy} aria-hidden="true">
        <strong className={styles.homeBrandWordmark}>Career AI</strong>
      </span>
      <span className={styles.srOnly}>Career AI home</span>
    </Link>
  );
}
