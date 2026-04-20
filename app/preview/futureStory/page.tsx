import Link from "next/link";
import { FutureStoryScrollytell } from "@/components/preview/future-story-scrollytell";
import styles from "../story/page.module.css";

export const metadata = {
  title: "Career AI — future roadmap (preview)",
  description:
    "Scroll narrative for where Career AI is headed: Checkr integration and one-click apply. Desktop-only; not linked from production.",
  robots: { index: false, follow: false },
};

export default function FutureStoryPreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/preview/story" className={styles.back}>
          ← Back to current story
        </Link>
        <span className={styles.previewTag}>preview · future</span>
      </header>

      <div className={styles.mobileNotice}>
        <p>
          This preview animates best on desktop. Open on a wider screen to see
          the scroll-driven roadmap story.
        </p>
        <Link href="/" className={styles.mobileBack}>
          ← Back to the main site
        </Link>
      </div>

      <div className={styles.desktopOnly}>
        <FutureStoryScrollytell />
      </div>
    </main>
  );
}
