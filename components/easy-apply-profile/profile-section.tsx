"use client";

import { getFieldDefinition } from "@/lib/application-profiles/config";
import {
  isFieldCurrentlyVisible,
  type ValidationErrors,
} from "@/lib/application-profiles/validation";
import type {
  AnyApplicationProfile,
  FieldDefinition,
  ResumeAssetReference,
  SchemaFamily,
  SectionDefinition,
} from "@/lib/application-profiles/types";
import { ProfileFieldRenderer } from "./profile-field-renderer";
import styles from "./easy-apply-profile.module.css";

type ProfileSectionProps = {
  errors: ValidationErrors;
  extraFieldDefinitions?: FieldDefinition[];
  isUploadingResume: boolean;
  onChange: (fieldKey: string, value: unknown) => void;
  onUploadResume: (file: File) => Promise<ResumeAssetReference>;
  profile: AnyApplicationProfile;
  schemaFamily: SchemaFamily;
  section: SectionDefinition;
};

function getSectionPresentation(section: SectionDefinition, fields: FieldDefinition[]) {
  if (section.id === "resume-upload") {
    return "resume";
  }

  if (section.id === "experience-history") {
    return "experience";
  }

  if (section.id === "education-history") {
    return "education";
  }

  if (fields.length <= 1) {
    return "single";
  }

  return "balanced";
}

export function ProfileSection({
  errors,
  extraFieldDefinitions = [],
  isUploadingResume,
  onChange,
  onUploadResume,
  profile,
  schemaFamily,
  section,
}: ProfileSectionProps) {
  const fields = section.fields
    .map((fieldKey) => {
      return (
        getFieldDefinition(schemaFamily, fieldKey) ??
        extraFieldDefinitions.find((field) => field.key === fieldKey)
      );
    })
    .filter((field): field is FieldDefinition => {
      if (!field) {
        return false;
      }

      return isFieldCurrentlyVisible(
        field,
        profile as unknown as Record<string, unknown>,
      );
    });

  const sectionPresentation = getSectionPresentation(section, fields);

  function renderFieldCell(field: FieldDefinition, className?: string) {
    return (
      <div
        className={[styles.sectionFieldCell, className].filter(Boolean).join(" ")}
        data-field-key={field.key}
        data-field-type={field.type}
        key={field.key}
      >
        <ProfileFieldRenderer
          errors={errors}
          field={field}
          isUploadingResume={isUploadingResume}
          onChange={onChange}
          onUploadResume={onUploadResume}
          value={(profile as Record<string, unknown>)[field.key]}
        />
      </div>
    );
  }

  function renderSectionContent() {
    if (sectionPresentation === "resume") {
      return (
        <div className={styles.sectionSingleColumnShell}>
          {fields.map((field) =>
            renderFieldCell(field, `${styles.sectionFieldCellResume} ${styles.sectionFieldCellConstrained}`),
          )}
        </div>
      );
    }

    if (sectionPresentation === "experience") {
      const summaryField = fields.find((field) => field.type !== "repeatable");
      const historyField = fields.find((field) => field.type === "repeatable");

      return (
        <div className={styles.sectionHeroSplit}>
          <div className={styles.sectionSidebarStack}>
            <div className={styles.sectionSidebarLead}>
              <span className={styles.sectionSidebarEyebrow}>Reusable summary</span>
              <p className={styles.sectionSidebarCopy}>
                Save the top-line experience signal we can carry into future autofill.
              </p>
            </div>
            {summaryField
              ? renderFieldCell(
                  summaryField,
                  `${styles.sectionFieldCellMetric} ${styles.sectionFieldCellSidebar}`,
                )
              : null}
          </div>

          <div className={styles.sectionMainStack}>
            {historyField
              ? renderFieldCell(
                  historyField,
                  `${styles.sectionFieldCellFeature} ${styles.sectionFieldCellHistory}`,
                )
              : null}
          </div>
        </div>
      );
    }

    if (sectionPresentation === "education") {
      return (
        <div className={styles.sectionSingleColumnShell}>
          {fields.map((field) =>
            renderFieldCell(
              field,
              `${styles.sectionFieldCellSingle} ${styles.sectionFieldCellConstrained} ${styles.sectionFieldCellEducation}`,
            ),
          )}
        </div>
      );
    }

    const sectionGridClassName = [
      styles.sectionGrid,
      sectionPresentation === "single" ? styles.sectionGridSingle : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={sectionGridClassName}>
        {fields.map((field) => {
          const fieldClassName = [
            sectionPresentation === "single" ? styles.sectionFieldCellSingle : "",
          ]
            .filter(Boolean)
            .join(" ");

          return renderFieldCell(field, fieldClassName);
        })}
      </div>
    );
  }

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          <p className={styles.sectionDescription}>{section.description}</p>
        </div>
        {section.tone === "optional" ? (
          <span className={styles.sectionTone}>Optional</span>
        ) : null}
      </div>

      {renderSectionContent()}
    </section>
  );
}
