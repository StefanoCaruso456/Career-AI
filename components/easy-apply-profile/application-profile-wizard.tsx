"use client";

import { ArrowLeft, ArrowRight, Check, CheckCircle2, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import {
  applicationProfileSteps,
  getFieldDefinition,
  getSchemaFamilyConfig,
} from "@/lib/application-profiles/config";
import {
  getStepFieldKeys,
  getMissingRequiredFieldKeys,
  validateProfile,
  type ValidationErrors,
} from "@/lib/application-profiles/validation";
import type {
  AnyApplicationProfile,
  FieldDefinition,
  ResumeAssetReference,
  SchemaFamily,
} from "@/lib/application-profiles/types";
import { ProfileSection } from "./profile-section";
import styles from "./easy-apply-profile.module.css";

type ApplicationProfileWizardProps = {
  contextMode?: "job" | "settings";
  extraFieldDefinitions?: FieldDefinition[];
  isSaving: boolean;
  isUploadingResume: boolean;
  missingFieldKeys?: string[];
  mode: "complete-profile" | "edit-profile" | "missing-fields";
  onCancel: () => void;
  onChangeProfile: (profile: AnyApplicationProfile) => void;
  onPersistProfile?: (profile: AnyApplicationProfile) => Promise<void>;
  onSubmitProfile: (profile: AnyApplicationProfile) => Promise<void>;
  onUploadResume: (file: File) => Promise<ResumeAssetReference>;
  persisted: boolean;
  profile: AnyApplicationProfile;
  saveError: string | null;
  schemaFamily: SchemaFamily;
};

function getInitialStepIndex(schemaFamily: SchemaFamily, profile: AnyApplicationProfile) {
  for (let index = 0; index < applicationProfileSteps.length - 1; index += 1) {
    const step = applicationProfileSteps[index];
    const stepErrors = validateProfile({
      fieldKeys: getStepFieldKeys(schemaFamily, step.id),
      profile,
      schemaFamily,
    });

    if (Object.keys(stepErrors).length > 0) {
      return index;
    }
  }

  return 0;
}

function formatReviewValue(field: FieldDefinition, value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (field.type === "checkbox") {
    return value === true ? "Confirmed" : "Not confirmed";
  }

  if (field.type === "checkboxGroup") {
    return Array.isArray(value) && value.length > 0 ? value.join(", ") : null;
  }

  if (field.type === "file") {
    return typeof value === "object" && value && "fileName" in value
      ? String(value.fileName)
      : null;
  }

  if (field.type === "repeatable") {
    if (!Array.isArray(value) || value.length === 0) {
      return null;
    }

    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        return Object.values(entry)
          .filter((item) => typeof item === "string" && item.trim().length > 0)
          .join(" • ");
      })
      .filter(Boolean)
      .join("\n");
  }

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getPrimaryErrorFieldKey(errors: ValidationErrors) {
  const firstErrorKey = Object.keys(errors)[0];

  if (!firstErrorKey) {
    return null;
  }

  return firstErrorKey.split(".")[0] ?? firstErrorKey;
}

function getStepValidationErrors(args: {
  profile: AnyApplicationProfile;
  schemaFamily: SchemaFamily;
  stepId: FieldDefinition["stepId"];
}) {
  return validateProfile({
    fieldKeys: getStepFieldKeys(args.schemaFamily, args.stepId),
    profile: args.profile,
    schemaFamily: args.schemaFamily,
  });
}

export function ApplicationProfileWizard({
  contextMode = "job",
  extraFieldDefinitions = [],
  isSaving,
  isUploadingResume,
  missingFieldKeys = [],
  mode,
  onCancel,
  onChangeProfile,
  onPersistProfile,
  onSubmitProfile,
  onUploadResume,
  persisted,
  profile,
  saveError,
  schemaFamily,
}: ApplicationProfileWizardProps) {
  const config = getSchemaFamilyConfig(schemaFamily);
  const isSettingsContext = contextMode === "settings";
  const footerStatusMessage = persisted
    ? "Saved changes go straight into your reusable application profile."
    : "Saved changes stay in this browser until server persistence is available.";
  const [currentStepIndex, setCurrentStepIndex] = useState(() =>
    getInitialStepIndex(schemaFamily, profile),
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const wizardBodyRef = useRef<HTMLDivElement | null>(null);
  const firstStepSecondaryLabel = isSettingsContext ? "Back" : "Not now";

  function focusFirstInvalidField(nextErrors: ValidationErrors) {
    const fieldKey = getPrimaryErrorFieldKey(nextErrors);

    if (!fieldKey) {
      return;
    }

    const fieldElement = wizardBodyRef.current?.querySelector<HTMLElement>(
      `[data-profile-field="${fieldKey}"]`,
    );

    if (!fieldElement) {
      return;
    }

    fieldElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    const focusTarget = fieldElement.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );

    focusTarget?.focus({ preventScroll: true });
  }

  function updateField(fieldKey: string, value: unknown) {
    const nextProfile = {
      ...profile,
      [fieldKey]: value,
    } as AnyApplicationProfile;

    setStepMessage(null);
    onChangeProfile(nextProfile);

    if (Object.keys(errors).length > 0) {
      const nextErrors =
        mode === "missing-fields"
          ? validateProfile({
              fieldKeys: missingFieldKeys,
              profile: nextProfile,
              schemaFamily,
            })
          : getStepValidationErrors({
              profile: nextProfile,
              schemaFamily,
              stepId: applicationProfileSteps[currentStepIndex]?.id ?? "basic-profile",
            });

      setErrors(nextErrors);
    }
  }

  async function handleSubmit() {
    const nextErrors =
      mode === "missing-fields"
        ? validateProfile({
            fieldKeys: missingFieldKeys,
            profile,
            schemaFamily,
          })
        : validateProfile({
            fieldKeys: applicationProfileSteps.flatMap((step) =>
              getStepFieldKeys(schemaFamily, step.id),
            ),
            profile,
            schemaFamily,
          });

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStepMessage("Complete the required fields above before continuing.");
      focusFirstInvalidField(nextErrors);
      return;
    }

    setStepMessage(null);
    await onSubmitProfile(profile);
  }

  if (mode === "missing-fields") {
    const missingFieldsSection = {
      description:
        "This employer needs a few extra answers. We only ask for the missing fields required right now.",
      fields: missingFieldKeys,
      id: "missing-fields",
      stepId: "review-save" as const,
      title: "Complete missing fields",
    };

    return (
      <div className={styles.wizardShell}>
        <div className={styles.wizardBody} ref={wizardBodyRef}>
          <ProfileSection
            errors={errors}
            extraFieldDefinitions={extraFieldDefinitions}
            isUploadingResume={isUploadingResume}
            onChange={updateField}
            onUploadResume={onUploadResume}
            profile={profile}
            schemaFamily={schemaFamily}
            section={missingFieldsSection}
          />
        </div>

        <div className={styles.wizardFooter}>
          {stepMessage ? (
            <p aria-live="polite" className={styles.validationMessage}>
              {stepMessage}
            </p>
          ) : null}
          {saveError ? <p className={styles.saveError}>{saveError}</p> : null}
          <div className={styles.footerStatusRow}>
            <p className={styles.statusNote}>{footerStatusMessage}</p>
          </div>
          <div className={styles.footerActions}>
            <button className={styles.secondaryButton} onClick={onCancel} type="button">
              {isSettingsContext ? (
                <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
              ) : null}
              <span>{firstStepSecondaryLabel}</span>
            </button>
            <button
              className={styles.primaryButton}
              disabled={isSaving}
              onClick={() => {
                void handleSubmit();
              }}
              type="button"
            >
              {isSaving ? (
                <LoaderCircle className={styles.inlineSpinner} aria-hidden="true" size={16} strokeWidth={2} />
              ) : (
                <CheckCircle2 aria-hidden="true" size={16} strokeWidth={2} />
              )}
              <span>Save and continue</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStep = applicationProfileSteps[currentStepIndex] ?? applicationProfileSteps[0];
  const isReviewStep = currentStep.id === "review-save";
  const visibleSections = config.sections.filter((section) => section.stepId === currentStep.id);

  async function handleNextStep() {
    const nextErrors = getStepValidationErrors({
      profile,
      schemaFamily,
      stepId: currentStep.id,
    });

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStepMessage("Complete the required fields above before continuing.");
      focusFirstInvalidField(nextErrors);
      return;
    }

    setStepMessage(null);

    if (onPersistProfile) {
      try {
        await onPersistProfile(profile);
      } catch {
        return;
      }
    }

    setCurrentStepIndex((currentIndex) =>
      Math.min(currentIndex + 1, applicationProfileSteps.length - 1),
    );
  }

  return (
    <div className={styles.wizardShell}>
      <ol aria-label={`${config.label} profile steps`} className={styles.stepper}>
        {applicationProfileSteps.map((step, index) => {
          const isActive = step.id === currentStep.id;
          const isComplete = index < currentStepIndex;

          return (
            <li
              aria-current={isActive ? "step" : undefined}
              className={`${styles.stepCard} ${isActive ? styles.stepCardActive : ""} ${isComplete ? styles.stepCardComplete : ""}`}
              key={step.id}
            >
              <div className={styles.stepCardTop}>
                <span className={styles.stepNumber}>
                  {isComplete ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : index + 1}
                </span>
              </div>
              <div className={styles.stepCopy}>
                <strong className={styles.stepTitle}>{step.title}</strong>
              </div>
            </li>
          );
        })}
      </ol>

      <div className={styles.wizardBody} ref={wizardBodyRef}>
        <section className={styles.stepLead}>
          <div className={styles.stepLeadCopy}>
            <span className={styles.stepLeadEyebrow}>
              Step {currentStepIndex + 1} of {applicationProfileSteps.length}
            </span>
            <h3 className={styles.stepLeadTitle}>{currentStep.title}</h3>
            <p className={styles.stepLeadDescription}>{currentStep.description}</p>
          </div>
          <div className={styles.stepLeadBadge}>
            {persisted ? "Reusable profile save is active" : "Browser-only draft mode"}
          </div>
        </section>

        {!isReviewStep ? (
          visibleSections.map((section) => (
            <ProfileSection
              errors={errors}
              extraFieldDefinitions={extraFieldDefinitions}
              isUploadingResume={isUploadingResume}
              key={section.id}
              onChange={updateField}
              onUploadResume={onUploadResume}
              profile={profile}
              schemaFamily={schemaFamily}
              section={section}
            />
          ))
        ) : (
          <div className={styles.reviewGrid}>
            {config.sections
              .filter((section) => section.stepId !== "review-save")
              .map((section) => {
                const reviewRows = section.fields
                  .map((fieldKey) => {
                    const field =
                      getFieldDefinition(schemaFamily, fieldKey) ??
                      extraFieldDefinitions.find((candidate) => candidate.key === fieldKey);

                    if (!field) {
                      return null;
                    }

                    const value = formatReviewValue(
                      field,
                      (profile as Record<string, unknown>)[fieldKey],
                    );

                    return value
                      ? {
                          key: field.key,
                          label: field.reviewLabel ?? field.label,
                          value,
                        }
                      : null;
                  })
                  .filter((row): row is { key: string; label: string; value: string } => Boolean(row));

                return (
                  <article className={styles.reviewCard} key={section.id}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 className={styles.sectionTitle}>{section.title}</h3>
                        <p className={styles.sectionDescription}>{section.description}</p>
                      </div>
                    </div>

                    {reviewRows.length > 0 ? (
                      <div className={styles.reviewValueList}>
                        {reviewRows.map((row) => (
                          <div className={styles.reviewItem} key={row.key}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.reviewPlaceholder}>
                        No saved values yet in this section.
                      </p>
                    )}
                  </article>
                );
              })}

            {getMissingRequiredFieldKeys({
              profile,
              schemaFamily,
            }).length > 0 ? (
              <article className={styles.reviewCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h3 className={styles.sectionTitle}>Still missing</h3>
                    <p className={styles.sectionDescription}>
                      Finish the required items below before we continue into the application.
                    </p>
                  </div>
                </div>
                <ul className={styles.missingList}>
                  {getMissingRequiredFieldKeys({
                    profile,
                    schemaFamily,
                  }).map((missingFieldKey) => {
                    const field = getFieldDefinition(schemaFamily, missingFieldKey);

                    return <li key={missingFieldKey}>{field?.label ?? missingFieldKey}</li>;
                  })}
                </ul>
              </article>
            ) : null}
          </div>
        )}
      </div>

      <div className={styles.wizardFooter}>
        {stepMessage ? (
          <p aria-live="polite" className={styles.validationMessage}>
            {stepMessage}
          </p>
        ) : null}
        {saveError ? <p className={styles.saveError}>{saveError}</p> : null}
        <div className={styles.footerStatusRow}>
          <p className={styles.statusNote}>{footerStatusMessage}</p>
        </div>
        <div className={styles.footerActions}>
          {currentStepIndex > 0 ? (
            <button
              className={styles.secondaryButton}
              disabled={isSaving}
              onClick={() => {
                setErrors({});
                setStepMessage(null);
                setCurrentStepIndex((current) => Math.max(current - 1, 0));
              }}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
              <span>Back</span>
            </button>
          ) : (
            <button
              className={styles.secondaryButton}
              disabled={isSaving}
              onClick={onCancel}
              type="button"
            >
              {isSettingsContext ? (
                <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
              ) : null}
              <span>{firstStepSecondaryLabel}</span>
            </button>
          )}

          {isReviewStep ? (
            <button
              className={styles.primaryButton}
              disabled={isSaving}
              onClick={() => {
                void handleSubmit();
              }}
              type="button"
            >
              {isSaving ? (
                <LoaderCircle className={styles.inlineSpinner} aria-hidden="true" size={16} strokeWidth={2} />
              ) : (
                <CheckCircle2 aria-hidden="true" size={16} strokeWidth={2} />
              )}
              <span>Save and continue</span>
            </button>
          ) : (
            <button
              className={styles.primaryButton}
              disabled={isSaving}
              onClick={() => {
                void handleNextStep();
              }}
              type="button"
            >
              {isSaving ? (
                <LoaderCircle className={styles.inlineSpinner} aria-hidden="true" size={16} strokeWidth={2} />
              ) : (
                <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
              )}
              <span>{isSaving ? "Saving..." : "Continue"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
