"use client";

import { X } from "lucide-react";
import { startTransition, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { getSchemaFamilyConfig } from "@/lib/application-profiles/config";
import { mergeProfileWithDefaults } from "@/lib/application-profiles/defaults";
import {
  clearProfileDraft,
  readProfileDraft,
  writeProfileDraft,
} from "@/lib/application-profiles/storage";
import type {
  AnyApplicationProfile,
  FieldDefinition,
  ResumeAssetReference,
  SchemaFamily,
} from "@/lib/application-profiles/types";
import { ApplicationProfileWizard } from "./application-profile-wizard";
import styles from "./easy-apply-profile.module.css";

type EasyApplyProfileModalProps = {
  companyName: string;
  extraFieldDefinitions?: FieldDefinition[];
  initialProfile: AnyApplicationProfile;
  isOpen: boolean;
  isSaving: boolean;
  jobTitle: string;
  missingFieldKeys?: string[];
  mode?: "complete-profile" | "edit-profile" | "missing-fields";
  onClose: () => void;
  onPersistProfile?: (profile: AnyApplicationProfile) => Promise<void>;
  onSaveProfile: (profile: AnyApplicationProfile) => Promise<void>;
  onUploadResume: (file: File) => Promise<ResumeAssetReference>;
  persisted: boolean;
  schemaFamily: SchemaFamily;
  userKey: string;
};

function getModalCopy(mode: EasyApplyProfileModalProps["mode"]) {
  if (mode === "missing-fields") {
    return {
      subtitle:
        "This employer needs a few more answers before we can continue the application.",
      support:
        "We only ask for the fields that are still missing for this application, then save them back into your reusable profile.",
      title: "Complete missing fields",
    };
  }

  if (mode === "edit-profile") {
    return {
      subtitle:
        "Update your reusable application profile and keep future applications fast, accurate, and ready to send.",
      support:
        "You can edit this anytime. We only reuse your saved information when an application needs it.",
      title: "Edit your saved profile",
    };
  }

  return {
    subtitle:
      "Complete your profile one time so you can apply to future jobs faster with one click.",
    support:
      "You can edit this anytime. We'll reuse your saved information only when needed for applications.",
    title: "Fill this out once",
  };
}

export function EasyApplyProfileModal({
  companyName,
  extraFieldDefinitions = [],
  initialProfile,
  isOpen,
  isSaving,
  jobTitle,
  missingFieldKeys = [],
  mode = "complete-profile",
  onClose,
  onPersistProfile,
  onSaveProfile,
  onUploadResume,
  persisted,
  schemaFamily,
  userKey,
}: EasyApplyProfileModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [profileDraft, setProfileDraft] = useState<AnyApplicationProfile>(() =>
    mergeProfileWithDefaults(schemaFamily, initialProfile),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const copy = getModalCopy(mode);
  const config = getSchemaFamilyConfig(schemaFamily);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const draftOverride = readProfileDraft(userKey, schemaFamily);
    setProfileDraft(
      mergeProfileWithDefaults(schemaFamily, draftOverride ?? initialProfile),
    );
    setSaveError(null);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [initialProfile, isOpen, schemaFamily, userKey]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    writeProfileDraft(userKey, schemaFamily, profileDraft);
  }, [isOpen, profileDraft, schemaFamily, userKey]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  async function handleSubmit(profile: AnyApplicationProfile) {
    setSaveError(null);

    try {
      await onSaveProfile(profile);
      clearProfileDraft(userKey, schemaFamily);
      startTransition(() => {
        onClose();
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We couldn't save your profile.");
    }
  }

  async function handlePersistProfile(profile: AnyApplicationProfile) {
    if (!onPersistProfile) {
      return;
    }

    setSaveError(null);

    try {
      await onPersistProfile(profile);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We couldn't save your profile.");
      throw error;
    }
  }

  async function handleResumeUpload(file: File) {
    setIsUploadingResume(true);

    try {
      return await onUploadResume(file);
    } finally {
      setIsUploadingResume(false);
    }
  }

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        aria-modal="true"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className={styles.modal}
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
      >
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderCopy}>
            <span className={styles.modalEyebrow}>Reusable application profile</span>
            <h2 className={styles.modalTitle} id={titleId}>
              {copy.title}
            </h2>
            <p className={styles.modalSubtitle} id={descriptionId}>
              {copy.subtitle}
            </p>
            <p className={styles.modalSupport}>{copy.support}</p>

            <div className={styles.modalContextGrid}>
              <div className={styles.modalContextCard}>
                <span className={styles.modalContextLabel}>Schema</span>
                <strong className={styles.modalContextValue}>{config.label}</strong>
              </div>
              <div className={styles.modalContextCard}>
                <span className={styles.modalContextLabel}>Company</span>
                <strong className={styles.modalContextValue}>{companyName}</strong>
              </div>
              <div
                className={`${styles.modalContextCard} ${styles.modalContextCardWide}`}
              >
                <span className={styles.modalContextLabel}>Profile prepared for</span>
                <strong className={styles.modalContextValue}>{jobTitle}</strong>
              </div>
            </div>
          </div>

          <div className={styles.modalHeaderActions}>
            <button
              aria-label="Close easy apply profile modal"
              className={styles.closeButton}
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <ApplicationProfileWizard
          extraFieldDefinitions={extraFieldDefinitions}
          isSaving={isSaving}
          isUploadingResume={isUploadingResume}
          missingFieldKeys={missingFieldKeys}
          mode={mode}
          onCancel={onClose}
          onChangeProfile={(nextProfile) => {
            setSaveError(null);
            setProfileDraft(nextProfile);
          }}
          onPersistProfile={handlePersistProfile}
          onSubmitProfile={handleSubmit}
          onUploadResume={handleResumeUpload}
          persisted={persisted}
          profile={profileDraft}
          saveError={saveError}
          schemaFamily={schemaFamily}
        />
      </div>
    </div>,
    document.body,
  );
}
