"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { AUTONOMOUS_APPLY_QUEUED_MESSAGE } from "@/lib/jobs/apply-run-messages";
import type { ApplyContinuationResult } from "@/lib/jobs/start-apply-run-client";
import { getPersonaSignInRoute } from "@/lib/personas";
import { getApplicationProfileKey } from "@/lib/application-profiles/defaults";
import { getMissingRequiredFieldKeys } from "@/lib/application-profiles/validation";
import type { AnyApplicationProfile, SchemaFamily } from "@/lib/application-profiles/types";
import { EasyApplyProfileModal } from "./easy-apply-profile-modal";
import { MissingFieldsModal } from "./missing-fields-modal";
import { useApplicationProfiles } from "./use-application-profiles";
import styles from "./easy-apply-profile.module.css";

type ProfileCompletionGuardProps = {
  buttonLabel?: string;
  buttonVariant?: "default" | "jobs-card";
  className?: string;
  companyName: string;
  employerMissingFieldKeys?: string[];
  jobTitle: string;
  resolveApplyUrl?:
    | (() => Promise<string | ApplyContinuationResult> | string | ApplyContinuationResult)
    | undefined;
  schemaFamily: SchemaFamily;
  applyUrl: string;
  skipProfileGate?: boolean;
};

function openExternalApply(applyUrl: string) {
  window.open(applyUrl, "_blank", "noopener,noreferrer");
}

export function ProfileCompletionGuard({
  applyUrl,
  buttonLabel = "Apply",
  buttonVariant = "default",
  className,
  companyName,
  employerMissingFieldKeys = [],
  jobTitle,
  resolveApplyUrl,
  schemaFamily,
  skipProfileGate = false,
}: ProfileCompletionGuardProps) {
  const {
    error,
    isAuthenticated,
    isLoading,
    isSaving,
    persisted,
    profiles,
    saveProfile,
    uploadResume,
    userKey,
  } = useApplicationProfiles();
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMissingFieldsModal, setShowMissingFieldsModal] = useState(false);
  const profile = profiles[getApplicationProfileKey(schemaFamily)];
  const familyMissingFieldKeys = getMissingRequiredFieldKeys({
    profile,
    schemaFamily,
  });
  const employerMissingKeys = getMissingRequiredFieldKeys({
    fieldKeys: employerMissingFieldKeys,
    profile,
    schemaFamily,
  });
  const ApplyIcon = buttonVariant === "jobs-card" ? null : Sparkles;
  const applyActionStackClassName = `${styles.applyActionStack} ${
    buttonVariant === "jobs-card" ? styles.applyActionStackJobsCard : ""
  }`;

  function redirectToSignIn() {
    const callbackUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(
      getPersonaSignInRoute({
        callbackUrl,
        persona: "job_seeker",
      }),
    );
  }

  async function continueToApply() {
    try {
      setApplyError(null);
      setApplyNotice(null);
      const nextApplyUrl = await resolveApplyUrl?.();

      if (typeof nextApplyUrl === "string") {
        openExternalApply(nextApplyUrl);
        return;
      }

      if (nextApplyUrl?.action === "queued") {
        setApplyNotice(nextApplyUrl.message || AUTONOMOUS_APPLY_QUEUED_MESSAGE);
        return;
      }

      if (nextApplyUrl?.action === "open_external") {
        openExternalApply(nextApplyUrl.applyUrl);
        return;
      }

      openExternalApply(applyUrl);
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : "The application link could not be opened.",
      );
    }
  }

  async function continueAfterProfileSave(savedProfile: AnyApplicationProfile) {
    const nextFamilyMissingFieldKeys = getMissingRequiredFieldKeys({
      profile: savedProfile,
      schemaFamily,
    });

    if (nextFamilyMissingFieldKeys.length > 0) {
      setShowMissingFieldsModal(false);
      setShowProfileModal(true);
      return;
    }

    const nextEmployerMissingKeys = getMissingRequiredFieldKeys({
      fieldKeys: employerMissingFieldKeys,
      profile: savedProfile,
      schemaFamily,
    });

    if (nextEmployerMissingKeys.length > 0) {
      setShowProfileModal(false);
      setShowMissingFieldsModal(true);
      return;
    }

    setShowProfileModal(false);
    setShowMissingFieldsModal(false);
    await continueToApply();
  }

  function handleApplyClick() {
    if (skipProfileGate) {
      void continueToApply();
      return;
    }

    if (!isAuthenticated) {
      redirectToSignIn();
      return;
    }

    if (familyMissingFieldKeys.length > 0) {
      setShowProfileModal(true);
      return;
    }

    if (employerMissingKeys.length > 0) {
      setShowMissingFieldsModal(true);
      return;
    }

    void continueToApply();
  }

  return (
    <>
      <div className={applyActionStackClassName} data-testid="apply-action-stack">
        <button
          aria-haspopup="dialog"
          className={`${styles.applyButton} ${
            buttonVariant === "jobs-card" ? styles.applyButtonJobsCard : ""
          } ${className ?? ""}`}
          disabled={isLoading && isAuthenticated}
          onClick={handleApplyClick}
          type="button"
        >
          {isLoading && isAuthenticated ? (
            <LoaderCircle className={styles.inlineSpinner} aria-hidden="true" size={16} strokeWidth={2} />
          ) : ApplyIcon ? (
            <ApplyIcon aria-hidden="true" size={16} strokeWidth={2} />
          ) : null}
          <span>{isLoading && isAuthenticated ? "Checking profile..." : buttonLabel}</span>
        </button>

        {applyNotice ? <p className={styles.inlineSuccess}>{applyNotice}</p> : null}
        {applyError || error ? <p className={styles.inlineError}>{applyError ?? error}</p> : null}
      </div>

      <EasyApplyProfileModal
        companyName={companyName}
        initialProfile={profile}
        isOpen={showProfileModal}
        isSaving={isSaving}
        jobTitle={jobTitle}
        onClose={() => {
          setShowProfileModal(false);
        }}
        onPersistProfile={async (nextProfile) => {
          await saveProfile({
            profile: nextProfile,
            schemaFamily,
          });
        }}
        onSaveProfile={async (nextProfile) => {
          const savedProfile = await saveProfile({
            profile: nextProfile,
            schemaFamily,
          });
          await continueAfterProfileSave(savedProfile);
        }}
        onUploadResume={uploadResume}
        persisted={persisted}
        schemaFamily={schemaFamily}
        userKey={userKey}
      />

      <MissingFieldsModal
        companyName={companyName}
        initialProfile={profile}
        isOpen={showMissingFieldsModal}
        isSaving={isSaving}
        jobTitle={jobTitle}
        missingFieldKeys={employerMissingKeys}
        onClose={() => {
          setShowMissingFieldsModal(false);
        }}
        onSaveProfile={async (nextProfile) => {
          const savedProfile = await saveProfile({
            profile: nextProfile,
            schemaFamily,
          });
          await continueAfterProfileSave(savedProfile);
        }}
        onUploadResume={uploadResume}
        persisted={persisted}
        schemaFamily={schemaFamily}
        userKey={userKey}
      />
    </>
  );
}
