"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./floating-site-header.module.css";

export function HeaderHomeLink() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <Link
      aria-current={isHome ? "page" : undefined}
      aria-label="Career AI home"
      className={styles.homeAction}
      href="/"
    >
      <span className={styles.homeMarkShell} aria-hidden="true">
        <Image
          alt=""
          className={styles.homeMarkImage}
          fill
          priority
          sizes="44px"
          src="/career-ai-home-mark.png"
        />
      </span>
      <span className={styles.homeBrandCopy} aria-hidden="true">
        <strong className={styles.homeBrandWordmark}>Career AI</strong>
      </span>
      <span className={styles.srOnly}>Career AI home</span>
    </Link>
  );
}
