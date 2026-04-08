import Link from "next/link";
import { HeaderAuthControls } from "./header-auth-controls";
import styles from "./floating-site-header.module.css";

export function FloatingSiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.shell}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>TA</span>
          <span className={styles.brandText}>
            <strong>Talent Agent ID</strong>
            <small>Agent Identity Platform</small>
          </span>
        </Link>

        <HeaderAuthControls />
      </div>
    </header>
  );
}
