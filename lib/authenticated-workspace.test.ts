import { describe, expect, it } from "vitest";
import {
  getAuthenticatedWorkspaceHref,
  getPostOnboardingDestination,
  getPostSignInDestination,
  hasIncompleteOnboarding,
} from "@/lib/authenticated-workspace";

describe("authenticated workspace routing", () => {
  it("treats unfinished onboarding states as incomplete", () => {
    expect(hasIncompleteOnboarding("not_started")).toBe(true);
    expect(hasIncompleteOnboarding("in_progress")).toBe(true);
    expect(hasIncompleteOnboarding("completed")).toBe(false);
    expect(hasIncompleteOnboarding(null)).toBe(false);
  });

  it("routes incomplete users to onboarding before their workspace", () => {
    expect(
      getAuthenticatedWorkspaceHref({
        onboardingStatus: "in_progress",
        persona: "employer",
      }),
    ).toBe("/onboarding");

    expect(
      getAuthenticatedWorkspaceHref({
        onboardingStatus: "completed",
        persona: "employer",
      }),
    ).toBe("/employer");
  });

  it("keeps sign-in and completion redirects aligned with persona", () => {
    expect(
      getPostSignInDestination({
        callbackUrl: "/employer",
        onboardingStatus: "not_started",
      }),
    ).toBe("/onboarding");

    expect(
      getPostSignInDestination({
        callbackUrl: "/employer",
        onboardingStatus: "completed",
      }),
    ).toBe("/employer");

    expect(getPostOnboardingDestination("employer")).toBe("/employer");
    expect(getPostOnboardingDestination("job_seeker")).toBe("/account");
    expect(getPostOnboardingDestination(null)).toBe("/account");
  });
});
