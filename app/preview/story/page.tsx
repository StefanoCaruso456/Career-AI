import Link from "next/link";
import { ProductScrollytell } from "@/components/preview/product-scrollytell";
import styles from "./page.module.css";

export const metadata = {
  title: "Career AI — product story (preview)",
  description:
    "Preview of the scrollytelling landing narrative. Desktop-only; not linked from production yet.",
  robots: { index: false, follow: false },
};

export default function StoryPreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Back to home
        </Link>
        <span className={styles.previewTag}>preview</span>
      </header>

      <div className={styles.mobileNotice}>
        <p>
          This preview animates best on desktop. Open on a wider screen to see the
          scroll-driven product story.
        </p>
        <Link href="/" className={styles.mobileBack}>
          ← Back to the main site
        </Link>
      </div>

      <div className={styles.desktopOnly}>
        <ProductScrollytell />
      </div>
    </main>
  );
}
