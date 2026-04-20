export const defaultPersona = "job_seeker" as const;

export type Persona = "job_seeker" | "employer";

type PersonaConfig = {
  authLabel: string;
  description: string;
  landingRoute: string;
  label: string;
  postAuthRoute: string;
  signInEyebrow: string;
  shortLabel: string;
  workspaceLabel: string;
};

export const personaConfigs: Record<Persona, PersonaConfig> = {
  employer: {
    authLabel: "Employer",
    description: "Employer and business hiring workspace",
    landingRoute: "/employer",
    label: "Employer / Business",
    postAuthRoute: "/employer",
    signInEyebrow: "Employer access",
    shortLabel: "Employer",
    workspaceLabel: "Hiring workspace",
  },
  job_seeker: {
    authLabel: "Job Seeker",
    description: "Job seeker identity and trust workspace",
    landingRoute: "/account",
    label: "Job Seeker",
    postAuthRoute: "/account",
    signInEyebrow: "Verified access",
    shortLabel: "Job Seeker",
    workspaceLabel: "Career workspace",
  },
};

export const personas = Object.keys(personaConfigs) as Persona[];

export function isPersona(value: string | null | undefined): value is Persona {
  return value === "job_seeker" || value === "employer";
}

export function getPersona(value: string | null | undefined): Persona {
  return isPersona(value) ? value : defaultPersona;
}

export function getPersonaFromRoleType(roleType: string | null | undefined): Persona | null {
  if (roleType === "candidate") {
    return "job_seeker";
  }

  if (roleType === "recruiter" || roleType === "hiring_manager") {
    return "employer";
  }

  return null;
}

export function getPersonaFromRoute(route: string | null | undefined): Persona | null {
  if (!route) {
    return null;
  }

  try {
    const normalizedUrl = new URL(route, "https://career-ai.local");
    const normalizedPathname = normalizedUrl.pathname.replace(/\/+$/, "") || "/";

    return (
      personas.find((persona) => {
        const landingRoute = personaConfigs[persona].landingRoute;

        return (
          normalizedPathname === landingRoute ||
          normalizedPathname.startsWith(`${landingRoute}/`)
        );
      }) ?? null
    );
  } catch {
    return null;
  }
}

export function resolvePersona({
  callbackUrl,
  persona,
}: {
  callbackUrl?: string | null | undefined;
  persona?: string | null | undefined;
}) {
  if (isPersona(persona)) {
    return persona;
  }

  return getPersonaFromRoute(callbackUrl) ?? defaultPersona;
}

export function resolveActivePersona({
  preferredPersona,
  roleType,
  route,
}: {
  preferredPersona?: string | null | undefined;
  roleType?: string | null | undefined;
  route?: string | null | undefined;
}) {
  return (
    getPersonaFromRoute(route) ??
    getPersonaFromRoleType(roleType) ??
    getPersona(preferredPersona)
  );
}

export function getPostAuthRoute(persona: Persona) {
  return personaConfigs[persona].postAuthRoute;
}

export function getSettingsRoute(persona: Persona) {
  return persona === "employer" ? "/employer/settings" : "/account/settings";
}

export function getSafeCallbackUrl(callbackUrl: string | null | undefined) {
  if (!callbackUrl) {
    return null;
  }

  try {
    const normalizedUrl = new URL(callbackUrl, "https://career-ai.local");

    if (normalizedUrl.origin !== "https://career-ai.local") {
      return null;
    }

    return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
  } catch {
    return null;
  }
}

export function getAuthCallbackUrl({
  callbackUrl,
  persona,
}: {
  callbackUrl?: string | null | undefined;
  persona: Persona;
}) {
  return getSafeCallbackUrl(callbackUrl) ?? getPostAuthRoute(persona);
}

export function getPersonaSignInRoute({
  callbackUrl,
  persona,
}: {
  callbackUrl?: string | null | undefined;
  persona: Persona;
}) {
  const params = new URLSearchParams();
  const safeCallbackUrl = getSafeCallbackUrl(callbackUrl);

  if (safeCallbackUrl) {
    params.set("callbackUrl", safeCallbackUrl);
  }

  if (persona !== defaultPersona) {
    params.set("persona", persona);
  }

  const query = params.toString();

  return query ? `/sign-in?${query}` : "/sign-in";
}
