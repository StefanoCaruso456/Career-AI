"use client";

import { CheckCircle2, LoaderCircle, PencilLine } from "lucide-react";
import { useState } from "react";
import { getSchemaFamilyConfig } from "@/lib/application-profiles/config";
import { getApplicationProfileKey } from "@/lib/application-profiles/defaults";
import { getMissingRequiredFieldKeys } from "@/lib/application-profiles/validation";
import type { SchemaFamily } from "@/lib/application-profiles/types";
import { EasyApplyProfileModal } from "./easy-apply-profile/easy-apply-profile-modal";
import { useApplicationProfiles } from "./easy-apply-profile/use-application-profiles";
import styles from "./access-requests/access-request-workflow.module.css";

const schemaFamilies: SchemaFamily[] = ["greenhouse", "stripe", "workday"];

function hasResumeReference(value: unknown) {
  return typeof value === "object" && value !== null && "fileName" in value;
}

export function ApplicationProfileSettingsCard() {
  const {
    error,
    isLoading,
    isSaving,
    persisted,
    profiles,
    saveProfile,
    uploadResume,
    userKey,
  } = useApplicationProfiles();
  const [activeFamily, setActiveFamily] = useState<SchemaFamily | null>(null);

  const activeProfile =
    activeFamily === null
      ? null
      : profiles[getApplicationProfileKey(activeFamily)];
  const activeMissingFieldKeys =
    activeFamily === null || activeProfile === null
      ? []
      : getMissingRequiredFieldKeys({
          profile: activeProfile,
          schemaFamily: activeFamily,
        });
  const activeMode =
    activeFamily === null
      ? "edit-profile"
      : activeMissingFieldKeys.length === 0
        ? "edit-profile"
        : "complete-profile";

  return (
    <section className={styles.card}>
      <div className={styles.stack}>
        <div>
          <span className={styles.eyebrow}>Application profiles</span>
          <h2>Reusable apply schemas</h2>
        </div>

        <p className={styles.lead}>
          Reopen any saved Workday, Greenhouse, or Stripe-style profile here and keep it
          ready for future applications without waiting until you click Apply on a job.
        </p>

        {isLoading ? (
          <div className={styles.applicationLoadingState}>
            <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} size={18} strokeWidth={2} />
            <span>Loading your saved application profiles…</span>
          </div>
        ) : (
          <div className={styles.applicationGrid}>
            {schemaFamilies.map((schemaFamily) => {
              const config = getSchemaFamilyConfig(schemaFamily);
              const profile = profiles[getApplicationProfileKey(schemaFamily)];
              const missingFieldKeys = getMissingRequiredFieldKeys({
                profile,
                schemaFamily,
              });
              const isComplete = missingFieldKeys.length === 0;
              const resumeSaved = hasResumeReference(
                (profile as Record<string, unknown>).resume_cv_file,
              );

              return (
                <article className={styles.applicationCard} key={schemaFamily}>
                  <div className={styles.applicationCardHeader}>
                    <div>
                      <span
                        className={`${styles.applicationStatusPill} ${
                          isComplete
                            ? styles.applicationStatusPillReady
                            : styles.applicationStatusPillNeedsAttention
                        }`}
                      >
                        {isComplete ? "Ready to reuse" : `${missingFieldKeys.length} fields left`}
                      </span>
                      <h3>{config.label}</h3>
                    </div>
                  </div>

                  <p className={styles.muted}>{config.heroCopy}</p>

                  <div className={styles.metaGrid}>
                    <article className={styles.metaCard}>
                      <span className={styles.metaLabel}>Resume</span>
                      <strong className={styles.metaValue}>
                        {resumeSaved ? "Saved" : "Not added"}
                      </strong>
                    </article>
                    <article className={styles.metaCard}>
                      <span className={styles.metaLabel}>State</span>
                      <strong className={styles.metaValue}>
                        {persisted ? "Saved to Career AI" : "Browser draft"}
                      </strong>
                    </article>
                  </div>

                  <div className={styles.actions}>
                    <button
                      aria-label={`${isComplete ? "Edit" : "Finish"} ${config.label}`}
                      className={styles.primaryButton}
                      disabled={isSaving}
                      onClick={() => {
                        setActiveFamily(schemaFamily);
                      }}
                      type="button"
                    >
                      {isComplete ? (
                        <PencilLine aria-hidden="true" size={16} strokeWidth={2} />
                      ) : (
                        <CheckCircle2 aria-hidden="true" size={16} strokeWidth={2} />
                      )}
                      <span>{isComplete ? "Edit saved profile" : "Finish setup"}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {error ? <p className={`${styles.statusMessage} ${styles.statusMessageError}`}>{error}</p> : null}

        <p className={styles.smallNote}>
          These reusable schemas stay separate from your account details so you can update
          application answers whenever they change.
        </p>
      </div>

      {activeFamily !== null && activeProfile !== null ? (
        <EasyApplyProfileModal
          companyName="Career AI"
          contextMode="settings"
          initialProfile={activeProfile}
          isOpen={true}
          isSaving={isSaving}
          jobTitle="Future applications"
          mode={activeMode}
          onClose={() => {
            setActiveFamily(null);
          }}
          onPersistProfile={async (nextProfile) => {
            await saveProfile({
              profile: nextProfile,
              schemaFamily: activeFamily,
            });
          }}
          onSaveProfile={async (nextProfile) => {
            await saveProfile({
              profile: nextProfile,
              schemaFamily: activeFamily,
            });
          }}
          onUploadResume={uploadResume}
          persisted={persisted}
          schemaFamily={activeFamily}
          userKey={userKey}
        />
      ) : null}
    </section>
  );
}
