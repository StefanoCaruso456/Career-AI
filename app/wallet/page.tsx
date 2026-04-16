import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Wallet | Career AI",
  description: "Wallet features for Career AI are coming soon.",
};

export default function WalletPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.stage} aria-labelledby="wallet-coming-soon-title">
          <h1 className={styles.title} id="wallet-coming-soon-title">
            Coming Soon
          </h1>
        </section>
      </div>
    </main>
  );
}
