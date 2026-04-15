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

function getSectionLayout(fields: FieldDefinition[]) {
  if (fields.length <= 1) {
    return "single";
  }

  const repeatableCount = fields.filter((field) => field.type === "repeatable").length;

  if (fields.length === 2 && repeatableCount === 1) {
    return "featureSplit";
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

  const sectionLayout = getSectionLayout(fields);
  const sectionGridClassName = [
    styles.sectionGrid,
    sectionLayout === "featureSplit" ? styles.sectionGridFeatureSplit : "",
    sectionLayout === "single" ? styles.sectionGridSingle : "",
  ]
    .filter(Boolean)
    .join(" ");

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

      <div className={sectionGridClassName}>
        {fields.map((field) => {
          const fieldClassName = [
            styles.sectionFieldCell,
            sectionLayout === "featureSplit" && field.type === "repeatable"
              ? styles.sectionFieldCellFeature
              : "",
            sectionLayout === "featureSplit" && field.type !== "repeatable"
              ? styles.sectionFieldCellSidebar
              : "",
            sectionLayout === "single" ? styles.sectionFieldCellSingle : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              className={fieldClassName}
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
        })}
      </div>
    </section>
  );
}
