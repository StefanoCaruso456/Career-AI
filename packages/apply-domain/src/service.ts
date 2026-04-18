import {
  AUTONOMOUS_APPLY_FEATURE_FLAG,
  isAutonomousApplyEnabled,
} from "./config";
import { randomUUID } from "node:crypto";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { mergeApplicationProfiles } from "@/lib/application-profiles/defaults";
import { resolveSchemaFamilyForJob } from "@/lib/application-profiles/resolver";
import { getMissingRequiredFieldKeys } from "@/lib/application-profiles/validation";
import type {
  AnyApplicationProfile,
  GreenhouseProfile,
  SchemaFamily,
  StripeProfile,
  WorkdayProfile,
} from "@/lib/application-profiles/types";
import {
  type ApplicationProfileSnapshotDto,
  type ApplyRunDto,
  type CreateApplyRunInput,
} from "@/packages/contracts/src";
import { ApiError } from "@/packages/contracts/src";
import { getJobPostingDetails } from "@/packages/jobs-domain/src";
import {
  createQueuedApplyRun,
  findExistingActiveApplyRun,
  isDatabaseConfigured,
} from "@/packages/persistence/src";

type SessionUserLike = {
  appUserId?: string | null;
  authProvider?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  image?: string | null;
  name?: string | null;
  providerUserId?: string | null;
};

function pickString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toSourceProfileRecord(value: AnyApplicationProfile) {
  return value as Record<string, unknown>;
}

function buildIdentity(args: {
  profile: Record<string, unknown>;
  sessionUser: SessionUserLike;
}) {
  const firstName = pickString(args.profile.first_name);
  const lastName = pickString(args.profile.last_name);
  const fullName =
    [firstName, lastName].filter((value): value is string => Boolean(value)).join(" ") ||
    pickString(args.sessionUser.name) ||
    null;
  const email = pickString(args.profile.email) ?? pickString(args.sessionUser.email);

  return {
    email,
    firstName,
    fullName,
    lastName,
  };
}

function buildContact(args: { profile: Record<string, unknown>; sessionUser: SessionUserLike }) {
  return {
    countryPhoneCode: pickString(args.profile.country_phone_code),
    email: pickString(args.profile.email) ?? pickString(args.sessionUser.email),
    phone:
      pickString(args.profile.phone_number) ??
      pickString(args.profile.phone) ??
      pickString(args.profile.phone_optional),
  };
}

function buildLocation(profile: Record<string, unknown>) {
  return {
    addressLine1: pickString(profile.address_line_1),
    city: pickString(profile.city) ?? pickString(profile.location_city),
    country: pickString(profile.country_territory) ?? pickString(profile.country),
    postalCode: pickString(profile.postal_code),
    region: pickString(profile.state_region),
  };
}

function buildWorkHistory(profile: Record<string, unknown>) {
  const value = profile.work_experience;

  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
}

function buildEducation(profile: Record<string, unknown>) {
  const value = profile.education;

  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
}

function buildWorkEligibility(profile: Record<string, unknown>) {
  return {
    canProvideIdentityDocuments: profile.can_provide_identity_and_work_authorization_documents,
    legalWorkAge: profile.legal_work_age,
    legallyAuthorizedToWork:
      profile.legally_authorized_to_work ?? profile.authorized_to_work_in_selected_locations,
    unrestrictedRightToWork: profile.unrestricted_right_to_work,
    workAuthorizationInCountry: profile.requires_work_authorization_in_position_country,
  };
}

function buildSponsorship(profile: Record<string, unknown>) {
  return {
    sponsorshipLocations: profile.locations_or_countries_requiring_hpe_sponsorship,
    sponsorshipRequired:
      profile.visa_sponsorship_required ?? profile.requires_stripe_work_permit_sponsorship,
    validResidencyPermit: profile.valid_residency_permit_for_position_country,
    validWorkPermit: profile.valid_work_permit_for_position_country,
  };
}

function buildDisclosures(profile: Record<string, unknown>) {
  const keys = [
    "ai_interview_assistance_acknowledgment",
    "ai_recruiting_process_acknowledgment",
    "candidate_information_accuracy_attestation",
    "conflict_of_interest_disclosure",
    "debarred_or_suspended_by_federal_agency",
    "disability_self_identification",
    "ethnicity",
    "gender",
    "protected_veteran_status",
    "samsung_personal_information_consent",
    "subject_to_non_compete_or_restrictive_covenant",
    "terms_and_conditions_agreement",
    "worked_for_employer_before",
  ] as const;

  return Object.fromEntries(
    keys
      .map((key) => [key, profile[key]])
      .filter((entry) => entry[1] !== undefined),
  );
}

function buildLinks(profile: Record<string, unknown>) {
  const keys = [
    "linkedin_url",
    "portfolio_url",
    "github_url",
    "website_url",
  ] as const;

  return Object.fromEntries(
    keys
      .map((key) => [key, profile[key]])
      .filter((entry) => entry[1] !== undefined),
  );
}

function buildEmployerSpecificDeltas(profile: Record<string, unknown>) {
  const excludedKeys = new Set([
    "address_line_1",
    "city",
    "country",
    "country_phone_code",
    "country_territory",
    "education",
    "email",
    "first_name",
    "last_name",
    "location_city",
    "phone_number",
    "postal_code",
    "resume_cv_file",
    "state_region",
    "work_experience",
  ]);

  return Object.fromEntries(
    Object.entries(profile).filter(([key, value]) => !excludedKeys.has(key) && value !== undefined),
  );
}

function buildProfileSnapshot(args: {
  profile: AnyApplicationProfile;
  schemaFamily: SchemaFamily;
  sessionUser: SessionUserLike;
  userId: string;
}): ApplicationProfileSnapshotDto {
  const sourceProfile = toSourceProfileRecord(args.profile);
  const identity = buildIdentity({
    profile: sourceProfile,
    sessionUser: args.sessionUser,
  });

  return {
    createdAt: new Date().toISOString(),
    disclosures: buildDisclosures(sourceProfile),
    documents: {
      resume: (sourceProfile.resume_cv_file as ApplicationProfileSnapshotDto["documents"]["resume"]) ?? null,
    },
    education: buildEducation(sourceProfile),
    employerSpecificDeltas: buildEmployerSpecificDeltas(sourceProfile),
    id: `profile_snapshot_${randomUUID()}`,
    identity,
    links: buildLinks(sourceProfile),
    location: buildLocation(sourceProfile),
    profileVersion: 1,
    provenance: {
      source: "career_identity.application_profiles_json",
      sourceUpdatedAt: null,
    },
    schemaFamily: args.schemaFamily,
    sourceProfile,
    sponsorship: buildSponsorship(sourceProfile),
    userId: args.userId,
    contact: buildContact({
      profile: sourceProfile,
      sessionUser: args.sessionUser,
    }),
    workEligibility: buildWorkEligibility(sourceProfile),
    workHistory: buildWorkHistory(sourceProfile),
  };
}

export async function createAutonomousApplyRun(args: {
  correlationId: string;
  input: CreateApplyRunInput;
  sessionUser: SessionUserLike;
}) {
  if (!isAutonomousApplyEnabled()) {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        feature_flag: AUTONOMOUS_APPLY_FEATURE_FLAG,
      },
      errorCode: "CONFLICT",
      message: "Autonomous apply is not enabled.",
      status: 409,
    });
  }

  if (!isDatabaseConfigured()) {
    throw new ApiError({
      correlationId: args.correlationId,
      details: null,
      errorCode: "DEPENDENCY_FAILURE",
      message: "Autonomous apply requires database-backed persistence.",
      status: 503,
    });
  }

  const { context } = await ensurePersistentCareerIdentityForSessionUser({
    correlationId: args.correlationId,
    user: args.sessionUser,
  });
  const job = await getJobPostingDetails({
    jobId: args.input.jobId,
  });

  if (!job) {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        jobId: args.input.jobId,
      },
      errorCode: "NOT_FOUND",
      message: "The requested job was not found.",
      status: 404,
    });
  }

  const schemaFamily = resolveSchemaFamilyForJob(job);
  const mergedProfiles = mergeApplicationProfiles(context.applicationProfiles);
  const profileKey = `${schemaFamily}_profile` as const;
  const profile = mergedProfiles[profileKey];
  const missingFieldKeys = getMissingRequiredFieldKeys({
    profile,
    schemaFamily,
  });

  if (missingFieldKeys.length > 0) {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        missingFieldKeys,
        schemaFamily,
      },
      errorCode: "VALIDATION_FAILED",
      message: "Your reusable application profile is incomplete for this apply flow.",
      status: 422,
    });
  }

  const targetApplyUrl = args.input.canonicalApplyUrl ?? job.canonicalApplyUrl ?? job.applyUrl;
  const existingRun = await findExistingActiveApplyRun({
    jobId: job.id,
    jobPostingUrl: targetApplyUrl,
    userId: context.user.id,
  });

  if (existingRun) {
    return {
      deduped: true,
      run: existingRun,
      snapshot: null,
    };
  }

  const snapshot = buildProfileSnapshot({
    profile:
      schemaFamily === "workday"
        ? (profile as WorkdayProfile)
        : schemaFamily === "greenhouse"
          ? (profile as GreenhouseProfile)
          : (profile as StripeProfile),
    schemaFamily,
    sessionUser: args.sessionUser,
    userId: context.user.id,
  });

  const run = await createQueuedApplyRun({
    run: {
      adapterId: null,
      atsFamily: null,
      attemptCount: 1,
      companyName: job.companyName,
      completedAt: null,
      createdAt: new Date().toISOString(),
      failureCode: null,
      failureMessage: null,
      featureFlagName: AUTONOMOUS_APPLY_FEATURE_FLAG,
      id: `apply_run_${randomUUID()}`,
      jobId: job.id,
      jobPostingUrl: targetApplyUrl,
      jobTitle: job.title,
      metadataJson: {
        conversationId: args.input.conversationId ?? null,
        jobSourceLabel: job.sourceLabel,
        schemaFamily,
        uiMetadata: args.input.metadata ?? {},
      },
      profileSnapshotId: snapshot.id,
      startedAt: null,
      status: "queued",
      terminalState: null,
      traceId: null,
      userId: context.user.id,
    } satisfies Omit<ApplyRunDto, "updatedAt">,
    snapshot,
  });

  return {
    deduped: false,
    run,
    snapshot,
  };
}
