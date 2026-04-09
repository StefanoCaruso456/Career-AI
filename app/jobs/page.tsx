import type { Metadata } from "next";
import { ArrowUpRight, BriefcaseBusiness, Radar, ShieldCheck } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Jobs | Career AI",
  description:
    "Match your Career Agent ID against live job requirements, signal gaps, and recruiter-facing trust criteria.",
};

const focusAreas = [
  {
    copy: "Map verified identity, employment, and artifact signals to role requirements before you apply.",
    title: "Signal-to-role matching",
  },
  {
    copy: "Surface the trust gaps that keep strong candidates from looking recruiter-ready for a target role.",
    title: "Missing proof detection",
  },
  {
    copy: "Turn your Career Agent ID into a live fit layer for priority job pipelines and outreach decisions.",
    title: "Prioritized opportunity view",
  },
];

export default function JobsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Job Matching Workspace</span>
            <h1 className={styles.title}>Match your Career Agent ID to the right jobs.</h1>
            <p className={styles.subtitle}>
              This page is the launch point for job matching. We will line up your verified
              identity, evidence, and trust signals against target roles so you can see where
              you already win and what proof still needs to be added.
            </p>

            <div className={styles.statusRow}>
              <div className={styles.statusPill}>
                <ShieldCheck aria-hidden="true" size={18} strokeWidth={2} />
                <span>Evidence-aware fit review</span>
              </div>
              <div className={styles.statusPill}>
                <Radar aria-hidden="true" size={18} strokeWidth={2} />
                <span>Signal gap detection</span>
              </div>
            </div>
          </div>

          <aside className={styles.heroPanel}>
            <div className={styles.panelBadge}>
              <BriefcaseBusiness aria-hidden="true" size={18} strokeWidth={2} />
              <span>Coming into focus</span>
            </div>
            <h2>Job matching will live here.</h2>
            <p>
              Start with the builder, verify your strongest signals, then return here to compare
              that profile against target roles and recruiter-safe expectations.
            </p>
            <Link className={styles.inlineLink} href="/agent-build">
              Open Agent Builder
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </aside>
        </section>

        <section className={styles.grid}>
          {focusAreas.map((area) => (
            <article className={styles.card} key={area.title}>
              <span className={styles.cardEyebrow}>Planned surface</span>
              <h2>{area.title}</h2>
              <p>{area.copy}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
