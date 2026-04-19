import Link from "next/link";
import { CareerIdBadgesPreview } from "@/components/preview/career-id-badges";
import styles from "./page.module.css";

export const metadata = {
  title: "Career ID badges — preview",
  description:
    "Preview of the redesigned badges layout for the Career ID page. Not linked from production.",
  robots: { index: false, follow: false },
};

export default function BadgesPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>;
}) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Back to home
        </Link>
        <span className={styles.previewTag}>preview</span>
      </header>

      <BadgesPreviewBody searchParams={searchParams} />
    </main>
  );
}

async function BadgesPreviewBody({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>;
}) {
  const params = await searchParams;
  const showEmpty = params.empty === "1";
  return <CareerIdBadgesPreview showEmpty={showEmpty} />;
}
