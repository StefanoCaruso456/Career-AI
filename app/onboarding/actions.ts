"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import {
  finishOnboarding,
  saveBasicProfile,
  saveCareerProfileBasics,
  saveRoleSelection,
} from "@/packages/onboarding/src";

async function requireOnboardingContext() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const { context } = await ensurePersistentCareerIdentityForSessionUser({
    user: {
      appUserId: session.user.appUserId,
      authProvider: session.user.authProvider,
      email: session.user.email,
      image: session.user.image,
      name: session.user.name,
      providerUserId: session.user.providerUserId,
    },
    correlationId: `onboarding_action_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
  });

  return context;
}

function revalidateAuthenticatedPaths() {
  revalidatePath("/onboarding");
  revalidatePath("/account");
  revalidatePath("/sign-in");
}

export async function submitBasicProfile(formData: FormData) {
  const context = await requireOnboardingContext();

  await saveBasicProfile({
    userId: context.user.id,
    correlationId: `onboarding_basic_${context.user.id}`,
    input: {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
    },
  });

  revalidateAuthenticatedPaths();
  redirect("/onboarding");
}

export async function submitRoleSelection(formData: FormData) {
  const context = await requireOnboardingContext();

  await saveRoleSelection({
    userId: context.user.id,
    correlationId: `onboarding_role_${context.user.id}`,
    input: {
      roleType: String(formData.get("roleType") ?? ""),
    },
  });

  revalidateAuthenticatedPaths();
  redirect("/onboarding");
}

export async function submitCareerProfileBasics(formData: FormData) {
  const context = await requireOnboardingContext();

  await saveCareerProfileBasics({
    userId: context.user.id,
    correlationId: `onboarding_profile_${context.user.id}`,
    input: {
      headline: String(formData.get("headline") ?? ""),
      location: String(formData.get("location") ?? ""),
      intent: String(formData.get("intent") ?? ""),
    },
  });

  revalidateAuthenticatedPaths();
  redirect("/onboarding");
}

export async function submitOnboardingCompletion() {
  const context = await requireOnboardingContext();

  await finishOnboarding({
    userId: context.user.id,
    correlationId: `onboarding_complete_${context.user.id}`,
  });

  revalidateAuthenticatedPaths();
  redirect("/account");
}
