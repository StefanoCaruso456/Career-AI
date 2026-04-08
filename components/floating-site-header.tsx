import { googleOAuthEnabled } from "@/auth";
import { HeaderAuthControls } from "./header-auth-controls";
import { HeaderCenterTab } from "./header-center-tab";
import { HeaderHomeLink } from "./header-home-link";
import styles from "./floating-site-header.module.css";

export function FloatingSiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.shell}>
        <HeaderHomeLink />
        <HeaderCenterTab />
        <HeaderAuthControls googleOAuthEnabled={googleOAuthEnabled} />
      </div>
    </header>
  );
}
