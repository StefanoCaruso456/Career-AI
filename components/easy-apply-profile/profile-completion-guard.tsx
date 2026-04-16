"use client";

import { ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { getPersonaSignInRoute } from "@/lib/personas";
import { getApplicationProfileKey } from "@/lib/application-profiles/defaults";
import { getMissingRequiredFieldKeys } from "@/lib/application-profiles/validation";
import type { SchemaFamily } from "@/lib/application-profiles/types";
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
  resolveApplyUrl?: (() => Promise<string> | string) | undefined;
  schemaFamily: SchemaFamily;
  applyUrl: string;
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
  const ApplyIcon = buttonVariant === "jobs-card" ? ArrowUpRight : Sparkles;

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
      const nextApplyUrl = await resolveApplyUrl?.();
      openExternalApply(nextApplyUrl ?? applyUrl);
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : "The application link could not be opened.",
      );
    }
  }

  function handleApplyClick() {
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
        ) : (
          <ApplyIcon aria-hidden="true" size={16} strokeWidth={2} />
        )}
        <span>{isLoading && isAuthenticated ? "Checking profile..." : buttonLabel}</span>
      </button>

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
          await saveProfile({
            profile: nextProfile,
            schemaFamily,
          });
          setShowProfileModal(false);
          await continueToApply();
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
          await saveProfile({
            profile: nextProfile,
            schemaFamily,
          });
          setShowMissingFieldsModal(false);
          await continueToApply();
        }}
        onUploadResume={uploadResume}
        persisted={persisted}
        schemaFamily={schemaFamily}
        userKey={userKey}
      />

      {applyError || error ? <p className={styles.inlineError}>{applyError ?? error}</p> : null}
    </>
  );
}
