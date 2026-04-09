function readFirstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

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
