import { googleOAuthEnabled } from "@/auth";
import { HeaderAuthControls } from "./header-auth-controls";
import styles from "./floating-site-header.module.css";

export function FloatingSiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.shell}>
        <HeaderAuthControls googleOAuthEnabled={googleOAuthEnabled} />
      </div>
    </header>
  );
}
