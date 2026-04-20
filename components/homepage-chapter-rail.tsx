"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import styles from "./homepage-chapter-rail.module.css";

export type HomepageChapter = {
  id: string;
  label: string;
  summary: string;
};

export function HomepageChapterRail({
  chapters,
}: {
  chapters: HomepageChapter[];
}) {
  const [activeId, setActiveId] = useState(chapters[0]?.id ?? "");

  const activeChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === activeId) ?? chapters[0],
    [activeId, chapters],
  );

  const activeIndex = activeChapter
    ? Math.max(
        0,
        chapters.findIndex((chapter) => chapter.id === activeChapter.id),
      )
    : 0;

  const setCurrentChapter = useEffectEvent((nextId: string) => {
    setActiveId((currentId) => (currentId === nextId ? currentId : nextId));
  });

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const sections = chapters
      .map((chapter) => document.getElementById(chapter.id))
      .filter((section): section is HTMLElement => section instanceof HTMLElement);

    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (!nextSection?.target.id) {
          return;
        }

        setCurrentChapter(nextSection.target.id);
      },
      {
        rootMargin: "-24% 0px -44% 0px",
        threshold: [0.2, 0.38, 0.55, 0.72],
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [chapters]);

  if (chapters.length === 0 || !activeChapter) {
    return null;
  }

  return (
    <aside className={styles.shell}>
      <div className={styles.rail}>
        <span className={styles.eyebrow}>Scroll Story</span>

        <div aria-hidden="true" className={styles.progressTrack}>
          <span
            className={styles.progressFill}
            style={{ transform: `scaleX(${(activeIndex + 1) / chapters.length})` }}
          />
        </div>

        <nav aria-label="Homepage sections" className={styles.nav}>
          {chapters.map((chapter) => (
            <Link
              aria-current={chapter.id === activeChapter.id ? "location" : undefined}
              className={[
                styles.link,
                chapter.id === activeChapter.id ? styles.linkActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              href={`#${chapter.id}`}
              key={chapter.id}
            >
              <span className={styles.linkLabel}>{chapter.label}</span>
            </Link>
          ))}
        </nav>

        <p aria-live="polite" className={styles.summary}>
          {activeChapter.summary}
        </p>
      </div>
    </aside>
  );
}
