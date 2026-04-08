import { googleOAuthEnabled } from "@/auth";
import { HeaderAuthControls } from "./header-auth-controls";
import { HeaderHomeLink } from "./header-home-link";
import styles from "./floating-site-header.module.css";

export function FloatingSiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.shell}>
        <HeaderHomeLink />
        <HeaderAuthControls googleOAuthEnabled={googleOAuthEnabled} />
      </div>
    </header>
  );
}
