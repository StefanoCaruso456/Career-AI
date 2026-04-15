"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import type { ValidationErrors } from "@/lib/application-profiles/validation";
import type {
  FieldDefinition,
  ResumeAssetReference,
} from "@/lib/application-profiles/types";
import { ResumeUploadField } from "./resume-upload-field";
import styles from "./easy-apply-profile.module.css";

type ProfileFieldRendererProps = {
  errors: ValidationErrors;
  field: FieldDefinition;
  isUploadingResume: boolean;
  onChange: (fieldKey: string, value: unknown) => void;
  onUploadResume: (file: File) => Promise<ResumeAssetReference>;
  value: unknown;
};

function getFieldError(errors: ValidationErrors, fieldKey: string) {
  return errors[fieldKey] ?? null;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toTextValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function RepeatableGroupField({
  errors,
  field,
  onChange,
  value,
}: Pick<ProfileFieldRendererProps, "errors" | "field" | "onChange" | "value">) {
  const items = Array.isArray(value) ? value : [];
  const repeatableConfig = field.repeatable;

  if (!repeatableConfig) {
    return null;
  }

  return (
    <div className={styles.repeatableStack}>
      {items.map((item, entryIndex) => {
        const entry = typeof item === "object" && item ? item : repeatableConfig.createEmptyItem();

        return (
          <article className={styles.repeatableCard} key={`${field.key}-${entryIndex}`}>
            <div className={styles.repeatableCardHeader}>
              <span>{repeatableConfig.entryLabel} {entryIndex + 1}</span>
              <button
                className={styles.removeButton}
                disabled={items.length <= (repeatableConfig.minItems ?? 1)}
                onClick={() => {
                  onChange(
                    field.key,
                    items.filter((_, index) => index !== entryIndex),
                  );
                }}
                type="button"
              >
                <Trash2 aria-hidden="true" size={14} strokeWidth={2} />
                <span>Remove</span>
              </button>
            </div>

            <div className={styles.repeatableGrid}>
              {repeatableConfig.fields.map((repeatableField) => {
                const errorKey = `${field.key}.${entryIndex}.${repeatableField.key}`;
                const childValue =
                  typeof entry === "object" && entry ? entry[repeatableField.key as keyof typeof entry] : "";

                if (repeatableField.type === "textarea") {
                  return (
                    <label className={styles.field} key={errorKey}>
                      <span className={styles.fieldLabel}>{repeatableField.label}</span>
                      <textarea
                        className={styles.textarea}
                        onChange={(event) => {
                          const nextEntries = [...items];
                          nextEntries[entryIndex] = {
                            ...entry,
                            [repeatableField.key]: event.target.value,
                          };
                          onChange(field.key, nextEntries);
                        }}
                        placeholder={repeatableField.placeholder}
                        rows={4}
                        value={toTextValue(childValue)}
                      />
                      {errors[errorKey] ? (
                        <span className={styles.fieldError}>{errors[errorKey]}</span>
                      ) : null}
                    </label>
                  );
                }

                if (repeatableField.type === "select") {
                  return (
                    <label className={styles.field} key={errorKey}>
                      <span className={styles.fieldLabel}>{repeatableField.label}</span>
                      <select
                        className={styles.select}
                        onChange={(event) => {
                          const nextEntries = [...items];
                          nextEntries[entryIndex] = {
                            ...entry,
                            [repeatableField.key]: event.target.value,
                          };
                          onChange(field.key, nextEntries);
                        }}
                        value={toTextValue(childValue)}
                      >
                        <option value="">Select…</option>
                        {(repeatableField.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {errors[errorKey] ? (
                        <span className={styles.fieldError}>{errors[errorKey]}</span>
                      ) : null}
                    </label>
                  );
                }

                return (
                  <label className={styles.field} key={errorKey}>
                    <span className={styles.fieldLabel}>{repeatableField.label}</span>
                    <input
                      className={styles.input}
                      onChange={(event) => {
                        const nextEntries = [...items];
                        nextEntries[entryIndex] = {
                          ...entry,
                          [repeatableField.key]: event.target.value,
                        };
                        onChange(field.key, nextEntries);
                      }}
                      placeholder={repeatableField.placeholder}
                      type={repeatableField.type === "date" ? "month" : "text"}
                      value={toTextValue(childValue)}
                    />
                    {errors[errorKey] ? (
                      <span className={styles.fieldError}>{errors[errorKey]}</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </article>
        );
      })}

      <button
        className={styles.addButton}
        onClick={() => {
          onChange(field.key, [...items, repeatableConfig.createEmptyItem()]);
        }}
        type="button"
      >
        <Plus aria-hidden="true" size={16} strokeWidth={2} />
        <span>{repeatableConfig.addLabel}</span>
      </button>
    </div>
  );
}

export function ProfileFieldRenderer({
  errors,
  field,
  isUploadingResume,
  onChange,
  onUploadResume,
  value,
}: ProfileFieldRendererProps) {
  const error = getFieldError(errors, field.key);
  const fieldStateProps = error
    ? {
        "aria-invalid": true,
        "data-invalid": "true",
      }
    : {};

  if (field.type === "file") {
    return (
      <div className={styles.field} data-profile-field={field.key} data-invalid={error ? "true" : undefined}>
        <ResumeUploadField
          helperText={field.helperText}
          isUploading={isUploadingResume}
          label={field.label}
          onUploaded={(nextValue) => {
            onChange(field.key, nextValue);
          }}
          onUploadResume={onUploadResume}
          value={(value as ResumeAssetReference | null) ?? null}
        />
        {error ? <span className={styles.fieldError}>{error}</span> : null}
      </div>
    );
  }

  if (field.type === "repeatable") {
    return (
      <div className={styles.field} data-profile-field={field.key} data-invalid={error ? "true" : undefined}>
        <div className={styles.fieldHeader}>
          <span className={styles.fieldLabel}>{field.label}</span>
          {field.helperText ? <span className={styles.fieldHint}>{field.helperText}</span> : null}
        </div>
        <RepeatableGroupField
          errors={errors}
          field={field}
          onChange={onChange}
          value={value}
        />
        {error ? <span className={styles.fieldError}>{error}</span> : null}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label
        className={styles.checkboxRow}
        data-profile-field={field.key}
        data-invalid={error ? "true" : undefined}
      >
        <input
          {...fieldStateProps}
          checked={Boolean(value)}
          onChange={(event) => {
            onChange(field.key, event.target.checked);
          }}
          type="checkbox"
        />
        <span>{field.label}</span>
        {error ? <span className={styles.fieldError}>{error}</span> : null}
      </label>
    );
  }

  if (field.type === "checkboxGroup") {
    const selectedValues = toStringArray(value);

    return (
      <div className={styles.field} data-profile-field={field.key} data-invalid={error ? "true" : undefined}>
        <div className={styles.fieldHeader}>
          <span className={styles.fieldLabel}>{field.label}</span>
          {field.helperText ? <span className={styles.fieldHint}>{field.helperText}</span> : null}
        </div>
        <div className={styles.choiceGrid}>
          {(field.options ?? []).map((option) => {
            const isSelected = selectedValues.includes(option.value);

            return (
              <label
                className={`${styles.choiceCard} ${isSelected ? styles.choiceCardActive : ""}`}
                key={option.value}
              >
                <input
                  checked={isSelected}
                  className={styles.hiddenInput}
                  onChange={() => {
                    const nextValues = isSelected
                      ? selectedValues.filter((entry) => entry !== option.value)
                      : [...selectedValues, option.value];

                    onChange(field.key, nextValues);
                  }}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        {error ? <span className={styles.fieldError}>{error}</span> : null}
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div className={styles.field} data-profile-field={field.key} data-invalid={error ? "true" : undefined}>
        <div className={styles.fieldHeader}>
          <span className={styles.fieldLabel}>{field.label}</span>
          {field.helperText ? <span className={styles.fieldHint}>{field.helperText}</span> : null}
        </div>
        <div className={styles.choiceGrid}>
          {(field.options ?? []).map((option) => {
            const isSelected = option.value === value;

            return (
              <label
                className={`${styles.choiceCard} ${isSelected ? styles.choiceCardActive : ""}`}
                key={option.value}
              >
                <input
                  checked={isSelected}
                  className={styles.hiddenInput}
                  onChange={() => {
                    onChange(field.key, option.value);
                  }}
                  type="radio"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        {error ? <span className={styles.fieldError}>{error}</span> : null}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label
        className={styles.field}
        data-profile-field={field.key}
        data-invalid={error ? "true" : undefined}
      >
        <div className={styles.fieldHeader}>
          <span className={styles.fieldLabel}>{field.label}</span>
          {field.helperText ? <span className={styles.fieldHint}>{field.helperText}</span> : null}
        </div>
        <select
          {...fieldStateProps}
          className={styles.select}
          onChange={(event) => {
            onChange(field.key, event.target.value);
          }}
          value={toTextValue(value)}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error ? <span className={styles.fieldError}>{error}</span> : null}
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label
        className={styles.field}
        data-profile-field={field.key}
        data-invalid={error ? "true" : undefined}
      >
        <div className={styles.fieldHeader}>
          <span className={styles.fieldLabel}>{field.label}</span>
          {field.helperText ? <span className={styles.fieldHint}>{field.helperText}</span> : null}
        </div>
        <textarea
          {...fieldStateProps}
          className={styles.textarea}
          onChange={(event) => {
            onChange(field.key, event.target.value);
          }}
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
          value={toTextValue(value)}
        />
        {error ? <span className={styles.fieldError}>{error}</span> : null}
      </label>
    );
  }

  return (
    <label
      className={styles.field}
      data-profile-field={field.key}
      data-invalid={error ? "true" : undefined}
    >
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>{field.label}</span>
        {field.helperText ? <span className={styles.fieldHint}>{field.helperText}</span> : null}
      </div>
      <input
        {...fieldStateProps}
        className={styles.input}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(field.key, event.target.value);
        }}
        placeholder={field.placeholder}
        type={field.inputType ?? (field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text")}
        value={toTextValue(value)}
      />
      {error ? <span className={styles.fieldError}>{error}</span> : null}
    </label>
  );
}
