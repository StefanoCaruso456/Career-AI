import { z } from "zod";
import type { PersistentTalentIdentityContext } from "@/packages/persistence/src";
import {
  completePersistentOnboarding,
  updateBasicProfileAndOnboarding,
  updateCareerProfileBasics,
  updateRoleSelection,
} from "@/packages/persistence/src";

export const onboardingRoleTypeSchema = z.enum([
  "candidate",
  "recruiter",
  "hiring_manager",
]);

const optionalUrlSchema = z
  .union([z.string().trim().url(), z.literal("")])
  .optional()
  .transform((value) => (value ? value : null));

export const basicProfileInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  imageUrl: optionalUrlSchema,
});

export const roleSelectionInputSchema = z.object({
  roleType: onboardingRoleTypeSchema,
});

export const careerProfileBasicsInputSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(120),
  intent: z.string().trim().min(1).max(240),
});

export function resolveAuthenticatedDestination(
  context: Pick<PersistentTalentIdentityContext, "onboarding">,
) {
  return context.onboarding.status === "completed" ? "/account" : "/onboarding";
}

export function resolveOnboardingStep(
  context: Pick<PersistentTalentIdentityContext, "onboarding">,
) {
  return context.onboarding.status === "completed"
    ? 4
    : Math.min(Math.max(context.onboarding.currentStep, 1), 4);
}

export async function saveBasicProfile(args: {
  userId: string;
  input: unknown;
  correlationId: string;
}) {
  const input = basicProfileInputSchema.parse(args.input);

  return updateBasicProfileAndOnboarding({
    userId: args.userId,
    firstName: input.firstName,
    lastName: input.lastName,
    imageUrl: input.imageUrl,
    correlationId: args.correlationId,
  });
}

export async function saveRoleSelection(args: {
  userId: string;
  input: unknown;
  correlationId: string;
}) {
  const input = roleSelectionInputSchema.parse(args.input);

  return updateRoleSelection({
    userId: args.userId,
    roleType: input.roleType,
    correlationId: args.correlationId,
  });
}

export async function saveCareerProfileBasics(args: {
  userId: string;
  input: unknown;
  correlationId: string;
}) {
  const input = careerProfileBasicsInputSchema.parse(args.input);

  return updateCareerProfileBasics({
    userId: args.userId,
    correlationId: args.correlationId,
    profilePatch: {
      headline: input.headline,
      location: input.location,
      intent: input.intent,
    },
  });
}

export async function finishOnboarding(args: {
  userId: string;
  correlationId: string;
}) {
  return completePersistentOnboarding(args);
}
