import { getPersona, getPostAuthRoute, type Persona } from "./personas";

export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | null
  | undefined;

export function hasIncompleteOnboarding(status: OnboardingStatus) {
  return status === "not_started" || status === "in_progress";
}

export function getAuthenticatedWorkspaceHref(args: {
  onboardingStatus: OnboardingStatus;
  persona: Persona;
}) {
  return hasIncompleteOnboarding(args.onboardingStatus)
    ? "/onboarding"
    : getPostAuthRoute(args.persona);
}

export function getPostSignInDestination(args: {
  callbackUrl: string;
  onboardingStatus: OnboardingStatus;
}) {
  return hasIncompleteOnboarding(args.onboardingStatus) ? "/onboarding" : args.callbackUrl;
}

export function getPostOnboardingDestination(persona: Persona | null | undefined) {
  return getPostAuthRoute(getPersona(persona));
}
