"use client";

import type { EmployerCandidateSearchFiltersDto } from "@/packages/contracts/src";
import styles from "./employer-sourcer-filters.module.css";

type EmployerSourcerFiltersProps = {
  filters: EmployerCandidateSearchFiltersDto;
  onChange: (nextFilters: EmployerCandidateSearchFiltersDto) => void;
};

export function EmployerSourcerFilters({
  filters,
  onChange,
}: EmployerSourcerFiltersProps) {
  return (
    <section className={styles.filtersShell}>
      <div className={styles.filtersHeader}>
        <div>
          <p className={styles.filtersEyebrow}>Structured filters</p>
          <h2 className={styles.filtersTitle}>Tighten the sourcing brief</h2>
        </div>
        <p className={styles.filtersCopy}>
          Add a few structured signals to steer ranking toward verified, recruiter-ready talent.
        </p>
      </div>

      <div className={styles.filtersGrid}>
        <label className={styles.field}>
          <span>Title</span>
          <input
            onChange={(event) => {
              onChange({
                ...filters,
                title: event.target.value.trim() || undefined,
              });
            }}
            placeholder="Software Engineer"
            type="text"
            value={filters.title ?? ""}
          />
        </label>

        <label className={styles.field}>
          <span>Skills</span>
          <input
            onChange={(event) => {
              onChange({
                ...filters,
                skills: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              });
            }}
            placeholder="Python, React, enterprise SaaS"
            type="text"
            value={filters.skills.join(", ")}
          />
        </label>

        <label className={styles.field}>
          <span>Location</span>
          <input
            onChange={(event) => {
              onChange({
                ...filters,
                location: event.target.value.trim() || null,
              });
            }}
            placeholder="Austin, TX"
            type="text"
            value={filters.location ?? ""}
          />
        </label>

        <label className={styles.field}>
          <span>Credibility floor</span>
          <select
            onChange={(event) => {
              onChange({
                ...filters,
                credibilityThreshold: event.target.value
                  ? Number(event.target.value)
                  : null,
              });
            }}
            value={filters.credibilityThreshold ?? ""}
          >
            <option value="">Any signal strength</option>
            <option value="0.55">Evidence-backed+</option>
            <option value="0.7">High credibility</option>
            <option value="0.85">Very high confidence</option>
          </select>
        </label>
      </div>

      <label className={styles.toggleRow}>
        <input
          checked={filters.verifiedExperienceOnly}
          onChange={(event) => {
            onChange({
              ...filters,
              verifiedExperienceOnly: event.target.checked,
            });
          }}
          type="checkbox"
        />
        <span>Prioritize candidates with verified experience signals only</span>
      </label>
    </section>
  );
}
