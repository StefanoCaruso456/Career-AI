function readFirstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function joinWithAnd(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export type GoogleAuthStatus = {
  disabledMessage: string;
  enabled: boolean;
  missingRequirements: string[];
  redirectUri: string;
};

export function getGoogleClientId() {
  return readFirstEnv("GOOGLE_CLIENT_ID", "GOOGLE_ID", "CLIENT_ID");
}

export function getGoogleClientSecret() {
  return readFirstEnv("GOOGLE_CLIENT_SECRET", "GOOGLE_SECRET", "CLIENT_SECRET");
}

export function getAuthSecret() {
  return readFirstEnv("NEXTAUTH_SECRET", "AUTH_SECRET");
}

export function getPublicBaseUrl() {
  const configuredUrl = readFirstEnv("NEXTAUTH_URL", "AUTH_URL");

  if (configuredUrl) {
    return configuredUrl;
  }

  const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

  if (railwayPublicDomain) {
    return `https://${railwayPublicDomain}`;
  }

  return "";
}

export function getGoogleRedirectUri() {
  const publicBaseUrl = getPublicBaseUrl();

  return publicBaseUrl ? `${publicBaseUrl}/api/auth/callback/google` : "";
}

export function getGoogleAuthMissingRequirements() {
  const missingRequirements: string[] = [];

  if (!getGoogleClientId()) {
    missingRequirements.push("GOOGLE_CLIENT_ID or GOOGLE_ID");
  }

  if (!getGoogleClientSecret()) {
    missingRequirements.push("GOOGLE_CLIENT_SECRET or GOOGLE_SECRET");
  }

  if (!getPublicBaseUrl()) {
    missingRequirements.push("NEXTAUTH_URL, AUTH_URL, or RAILWAY_PUBLIC_DOMAIN");
  }

  if (!getAuthSecret()) {
    missingRequirements.push("NEXTAUTH_SECRET or AUTH_SECRET");
  }

  return missingRequirements;
}

export function getGoogleAuthDisabledMessage() {
  const missingRequirements = getGoogleAuthMissingRequirements();

  if (missingRequirements.length === 0) {
    return "";
  }

  const missingList = joinWithAnd(missingRequirements);
  const verb = missingRequirements.length === 1 ? "is" : "are";

  return `Google sign-in is disabled until ${missingList} ${verb} configured.`;
}

export function getGoogleAuthStatus(): GoogleAuthStatus {
  const missingRequirements = getGoogleAuthMissingRequirements();

  return {
    disabledMessage:
      missingRequirements.length === 0
        ? ""
        : getGoogleAuthDisabledMessage(),
    enabled: missingRequirements.length === 0,
    missingRequirements,
    redirectUri: getGoogleRedirectUri(),
  };
}
