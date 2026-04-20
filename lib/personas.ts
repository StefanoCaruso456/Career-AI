export const defaultPersona = "job_seeker" as const;

export type Persona = "job_seeker" | "employer";

type PersonaConfig = {
  authLabel: string;
  description: string;
  label: string;
  landingRoute: string;
  settingsRoute: string;
  shortLabel: string;
  signInEyebrow: string;
  workspaceLabel: string;
};

type RoleType = "candidate" | "hiring_manager" | "recruiter";

const roleTypeToPersona: Record<RoleType, Persona> = {
  candidate: "job_seeker",
  hiring_manager: "employer",
  recruiter: "employer",
};

export const personaConfigs: Record<Persona, PersonaConfig> = {
  employer: {
    authLabel: "Employer",
    description: "Employer and business hiring workspace",
    label: "Employer / Business",
    landingRoute: "/employer",
    settingsRoute: "/employer/settings",
    shortLabel: "Employer",
    signInEyebrow: "Employer access",
    workspaceLabel: "Employer workspace",
  },
  job_seeker: {
    authLabel: "Job Seeker",
    description: "Job seeker identity and trust workspace",
    label: "Job Seeker",
    landingRoute: "/account",
    settingsRoute: "/account/settings",
    shortLabel: "Job Seeker",
    signInEyebrow: "Verified access",
    workspaceLabel: "Job seeker workspace",
  },
};

export const personas = Object.keys(personaConfigs) as Persona[];

function normalizePathname(route: string | null | undefined) {
  if (!route) {
    return null;
  }

  try {
    const normalizedUrl = new URL(route, "https://career-ai.local");
    return normalizedUrl.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

function matchesPersonaPath(pathname: string, candidatePath: string) {
  return pathname === candidatePath || pathname.startsWith(`${candidatePath}/`);
}

export function isPersona(value: string | null | undefined): value is Persona {
  return value === "job_seeker" || value === "employer";
}

export function getPersona(value: string | null | undefined): Persona {
  return isPersona(value) ? value : defaultPersona;
}

export function getPersonaFromRoute(route: string | null | undefined): Persona | null {
  const normalizedPathname = normalizePathname(route);

  if (!normalizedPathname) {
    return null;
  }

  if (matchesPersonaPath(normalizedPathname, personaConfigs.job_seeker.landingRoute)) {
    return "job_seeker";
  }

  if (matchesPersonaPath(normalizedPathname, personaConfigs.employer.landingRoute)) {
    return "employer";
  }

  return null;
}

export function getPersonaFromRoleType(roleType: string | null | undefined): Persona | null {
  if (!roleType) {
    return null;
  }

  return roleTypeToPersona[roleType as RoleType] ?? null;
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

export function resolveActivePersona(args: {
  preferredPersona?: string | null | undefined;
  roleType?: string | null | undefined;
  route?: string | null | undefined;
}) {
  return (
    getPersonaFromRoute(args.route) ??
    getPersonaFromRoleType(args.roleType) ??
    getPersona(args.preferredPersona)
  );
}

export function getPostAuthRoute(persona: Persona) {
  return personaConfigs[persona].landingRoute;
}

export function getSettingsRoute(persona: Persona) {
  return personaConfigs[persona].settingsRoute;
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
