import { mergeApplicationProfiles, mergeProfileWithDefaults } from "./defaults";
import { chooseMoreCompleteProfile } from "./validation";
import type {
  AnyApplicationProfile,
  ApplicationProfiles,
  SchemaFamily,
} from "./types";

const profilesCacheVersion = "v1";

function getProfilesCacheKey(userKey: string) {
  return `career-ai.application-profiles.${profilesCacheVersion}.${userKey}`;
}

function getDraftKey(userKey: string, schemaFamily: SchemaFamily) {
  return `career-ai.application-profiles.draft.${profilesCacheVersion}.${userKey}.${schemaFamily}`;
}

function readStorageValue<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : null;
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures so the modal keeps working in private mode.
  }
}

export function readCachedApplicationProfiles(userKey: string): ApplicationProfiles {
  return mergeApplicationProfiles(readStorageValue(getProfilesCacheKey(userKey)));
}

export function writeCachedApplicationProfiles(userKey: string, profiles: ApplicationProfiles) {
  writeStorageValue(getProfilesCacheKey(userKey), profiles);
}

export function mergeRemoteProfilesWithCache(
  userKey: string,
  remoteProfiles: ApplicationProfiles,
): ApplicationProfiles {
  const cachedProfiles = readCachedApplicationProfiles(userKey);

  return {
    greenhouse_profile: chooseMoreCompleteProfile(
      "greenhouse",
      cachedProfiles.greenhouse_profile,
      remoteProfiles.greenhouse_profile,
    ),
    stripe_profile: chooseMoreCompleteProfile(
      "stripe",
      cachedProfiles.stripe_profile,
      remoteProfiles.stripe_profile,
    ),
    workday_profile: chooseMoreCompleteProfile(
      "workday",
      cachedProfiles.workday_profile,
      remoteProfiles.workday_profile,
    ),
  };
}

export function readProfileDraft(
  userKey: string,
  schemaFamily: SchemaFamily,
): AnyApplicationProfile | null {
  const value = readStorageValue<Record<string, unknown>>(getDraftKey(userKey, schemaFamily));

  if (!value) {
    return null;
  }

  return mergeProfileWithDefaults(schemaFamily, value);
}

export function writeProfileDraft(
  userKey: string,
  schemaFamily: SchemaFamily,
  profile: AnyApplicationProfile,
) {
  writeStorageValue(getDraftKey(userKey, schemaFamily), profile);
}

export function clearProfileDraft(userKey: string, schemaFamily: SchemaFamily) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getDraftKey(userKey, schemaFamily));
  } catch {
    // Ignore storage cleanup failures.
  }
}
