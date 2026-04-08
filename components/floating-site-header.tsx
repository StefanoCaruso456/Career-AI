import { googleOAuthEnabled, googleRedirectUri, publicOrigin } from "@/auth";
import { HeaderAuthControls } from "./header-auth-controls";
import styles from "./floating-site-header.module.css";

export function FloatingSiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.shell}>
        <HeaderAuthControls
          googleOAuthEnabled={googleOAuthEnabled}
          productionOrigin={publicOrigin || "https://taidai-production.up.railway.app"}
          productionRedirectUri={
            googleRedirectUri || "https://taidai-production.up.railway.app/api/auth/callback/google"
          }
        />
      </div>
    </header>
  );
}
