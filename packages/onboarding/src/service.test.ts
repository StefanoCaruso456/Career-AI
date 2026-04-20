import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findPersistentContextByUserId,
  provisionGoogleUser,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  finishOnboarding,
  resolveAuthenticatedDestination,
  resolveOnboardingStep,
  saveBasicProfile,
  saveCareerProfileBasics,
  saveRoleSelection,
} from "@/packages/onboarding/src";

describe("onboarding service", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("persists onboarding progress step by step and resumes at the correct step", async () => {
    const provisioned = await provisionGoogleUser({
      email: "onboarding@example.com",
      fullName: "Onboarding User",
      firstName: "Onboarding",
      lastName: "User",
      providerUserId: "google-onboarding-1",
      emailVerified: true,
      correlationId: "corr-1",
    });

    const afterStepOne = await saveBasicProfile({
      userId: provisioned.context.user.id,
      input: {
        firstName: "Onboarding",
        lastName: "User",
      },
      correlationId: "corr-2",
    });
    const afterStepTwo = await saveRoleSelection({
      userId: provisioned.context.user.id,
      input: {
        roleType: "candidate",
      },
      correlationId: "corr-3",
    });
    await saveCareerProfileBasics({
      userId: provisioned.context.user.id,
      input: {
        headline: "Platform engineer exploring new roles",
        location: "Chicago, IL",
        intent: "I want a persistent, recruiter-ready profile.",
      },
      correlationId: "corr-4",
    });

    const resumed = await findPersistentContextByUserId({
      userId: provisioned.context.user.id,
      correlationId: "corr-5",
    });

    expect(afterStepOne.onboarding.currentStep).toBe(2);
    expect(afterStepTwo.onboarding.currentStep).toBe(3);
    expect(resumed.onboarding.status).toBe("in_progress");
    expect(resolveOnboardingStep(resumed)).toBe(4);
    expect(resolveAuthenticatedDestination(resumed)).toBe("/onboarding");
  });

  it("marks onboarding complete and routes finished users to the account area", async () => {
    const provisioned = await provisionGoogleUser({
      email: "complete@example.com",
      fullName: "Complete User",
      firstName: "Complete",
      lastName: "User",
      providerUserId: "google-onboarding-2",
      emailVerified: true,
      correlationId: "corr-1",
    });

    await saveBasicProfile({
      userId: provisioned.context.user.id,
      input: {
        firstName: "Complete",
        lastName: "User",
      },
      correlationId: "corr-2",
    });
    await saveRoleSelection({
      userId: provisioned.context.user.id,
      input: {
        roleType: "recruiter",
      },
      correlationId: "corr-3",
    });
    await saveCareerProfileBasics({
      userId: provisioned.context.user.id,
      input: {
        headline: "Recruiting lead building a durable talent workflow",
        location: "Austin, TX",
        intent: "I want to evaluate candidates through a structured identity system.",
      },
      correlationId: "corr-4",
    });

    const completed = await finishOnboarding({
      userId: provisioned.context.user.id,
      correlationId: "corr-5",
    });

    expect(completed.onboarding.status).toBe("completed");
    expect(completed.onboarding.profileCompletionPercent).toBe(100);
    expect(resolveAuthenticatedDestination(completed)).toBe("/employer/candidates");
  });

  it("routes completed candidates to the account area", async () => {
    const provisioned = await provisionGoogleUser({
      email: "candidate-complete@example.com",
      fullName: "Candidate Complete",
      firstName: "Candidate",
      lastName: "Complete",
      providerUserId: "google-onboarding-3",
      emailVerified: true,
      correlationId: "corr-6",
    });

    await saveBasicProfile({
      userId: provisioned.context.user.id,
      input: {
        firstName: "Candidate",
        lastName: "Complete",
      },
      correlationId: "corr-7",
    });
    await saveRoleSelection({
      userId: provisioned.context.user.id,
      input: {
        roleType: "candidate",
      },
      correlationId: "corr-8",
    });
    await saveCareerProfileBasics({
      userId: provisioned.context.user.id,
      input: {
        headline: "Candidate profile",
        location: "Chicago, IL",
        intent: "I want recruiters to find me.",
      },
      correlationId: "corr-9",
    });

    const completed = await finishOnboarding({
      userId: provisioned.context.user.id,
      correlationId: "corr-10",
    });

    expect(resolveAuthenticatedDestination(completed)).toBe("/account");
  });
});
