import { getDefaultProfileForFamily } from "./defaults";
import { getSchemaFamilyConfig } from "./config";
import type {
  AnyApplicationProfile,
  FieldDefinition,
  RepeatableFieldDefinition,
  SchemaFamily,
} from "./types";

export type ValidationErrors = Record<string, string>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringPopulated(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFieldCurrentlyVisible(
  field: FieldDefinition,
  profile: Record<string, unknown>,
) {
  if (!field.visibleWhen) {
    return true;
  }

  const targetValue = profile[field.visibleWhen.field];

  if (field.visibleWhen.equals !== undefined) {
    return targetValue === field.visibleWhen.equals;
  }

  if (field.visibleWhen.notEquals !== undefined) {
    return targetValue !== field.visibleWhen.notEquals;
  }

  if (field.visibleWhen.includes !== undefined) {
    return Array.isArray(targetValue) && targetValue.includes(field.visibleWhen.includes);
  }

  return true;
}

function getTopLevelFieldError(field: FieldDefinition, value: unknown, profile: Record<string, unknown>) {
  if (!field.required) {
    return null;
  }

  if (field.type === "checkbox") {
    return value === true ? null : "Please confirm this before continuing.";
  }

  if (field.type === "checkboxGroup") {
    return Array.isArray(value) && value.length > 0 ? null : "Choose at least one option.";
  }

  if (field.type === "file") {
    return isObject(value) && isStringPopulated(value.fileName) ? null : "Upload your resume to continue.";
  }

  if (field.type === "repeatable") {
    return Array.isArray(value) && value.length > 0 ? null : "Add at least one entry.";
  }

  if (!isStringPopulated(value)) {
    return "This field is required.";
  }

  if (field.type === "email") {
    const normalizedValue = String(value).trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue)
      ? null
      : "Enter a valid email address.";
  }

  if (field.type === "phone") {
    return String(value).trim().length >= 7 ? null : "Enter a valid phone number.";
  }

  if (field.key === "verify_password") {
    return value === profile.password ? null : "Passwords need to match.";
  }

  return null;
}

function getRepeatableFieldError(
  item: Record<string, unknown>,
  field: RepeatableFieldDefinition,
) {
  if (!field.required) {
    return null;
  }

  return isStringPopulated(item[field.key]) ? null : "This entry is required.";
}

export function validateProfile(args: {
  fieldKeys?: string[];
  profile: AnyApplicationProfile;
  schemaFamily: SchemaFamily;
  stepId?: FieldDefinition["stepId"];
}): ValidationErrors {
  const config = getSchemaFamilyConfig(args.schemaFamily);
  const profile = args.profile as unknown as Record<string, unknown>;
  const errors: ValidationErrors = {};

  const candidateFields = config.fields.filter((field) => {
    if (args.stepId && field.stepId !== args.stepId) {
      return false;
    }

    if (args.fieldKeys && !args.fieldKeys.includes(field.key)) {
      return false;
    }

    return isFieldCurrentlyVisible(field, profile);
  });

  for (const field of candidateFields) {
    const value = profile[field.key];
    const topLevelError = getTopLevelFieldError(field, value, profile);

    if (topLevelError) {
      errors[field.key] = topLevelError;
    }

    if (field.type !== "repeatable" || !field.repeatable || !Array.isArray(value)) {
      continue;
    }

    value.forEach((entry, entryIndex) => {
      const normalizedEntry = isObject(entry) ? entry : {};

      field.repeatable?.fields.forEach((repeatableField) => {
        const repeatableError = getRepeatableFieldError(normalizedEntry, repeatableField);

        if (repeatableError) {
          errors[`${field.key}.${entryIndex}.${repeatableField.key}`] = repeatableError;
        }
      });
    });
  }

  return errors;
}

export function getMissingRequiredFieldKeys(args: {
  fieldKeys?: string[];
  profile: AnyApplicationProfile;
  schemaFamily: SchemaFamily;
}) {
  return Object.keys(
    validateProfile({
      fieldKeys: args.fieldKeys,
      profile: args.profile,
      schemaFamily: args.schemaFamily,
    }),
  )
    .map((key) => key.split(".")[0] ?? key)
    .filter((key, index, array) => array.indexOf(key) === index);
}

export function isProfileComplete(schemaFamily: SchemaFamily, profile: AnyApplicationProfile) {
  return getMissingRequiredFieldKeys({
    profile,
    schemaFamily,
  }).length === 0;
}

export function countPopulatedProfileFields(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 ? 1 : 0;
  }

  if (Array.isArray(value)) {
    return value.reduce<number>(
      (total, item) => total + countPopulatedProfileFields(item),
      0,
    );
  }

  if (isObject(value)) {
    return Object.values(value).reduce<number>(
      (total, currentValue) => total + countPopulatedProfileFields(currentValue),
      0,
    );
  }

  return 0;
}

export function chooseMoreCompleteProfile<T extends AnyApplicationProfile>(
  schemaFamily: SchemaFamily,
  leftValue: T,
  rightValue: T,
) {
  const baseline = getDefaultProfileForFamily(schemaFamily);
  const leftScore = countPopulatedProfileFields(leftValue) - countPopulatedProfileFields(baseline);
  const rightScore =
    countPopulatedProfileFields(rightValue) - countPopulatedProfileFields(baseline);

  return rightScore >= leftScore ? rightValue : leftValue;
}

export function getStepFieldKeys(schemaFamily: SchemaFamily, stepId: FieldDefinition["stepId"]) {
  return getSchemaFamilyConfig(schemaFamily).sections
    .filter((section) => section.stepId === stepId)
    .flatMap((section) => section.fields);
}
