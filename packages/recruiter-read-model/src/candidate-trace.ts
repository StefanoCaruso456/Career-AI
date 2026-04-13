import type { CareerEvidenceRecord } from "@/packages/contracts/src";
import {
  ApiError,
  employerCandidateTraceInputSchema,
  employerCandidateTraceResponseSchema,
  type EmployerCandidateTraceResolvedBy,
  type RecruiterEmploymentRecordViewDto,
} from "@/packages/contracts/src";
import { listClaimDetails } from "@/packages/credential-domain/src";
import {
  findPersistentContextByTalentIdentityId,
  findPersistentRecruiterCandidateProjectionByLookup,
  getPersistentCareerBuilderProfile,
  listPersistentCareerBuilderEvidence,
} from "@/packages/persistence/src";
import { ensureRecruiterDemoDatasetLoaded } from "./demo-dataset";

function shouldAutoloadRecruiterDemoDataset() {
  const explicitSetting = process.env.CAREER_AI_ENABLE_RECRUITER_DEMO_DATASET?.trim().toLowerCase();

  if (explicitSetting === "1" || explicitSetting === "true" || explicitSetting === "yes") {
    return true;
  }

  if (explicitSetting === "0" || explicitSetting === "false" || explicitSetting === "no") {
    return false;
  }

  return process.env.NODE_ENV !== "test";
}

function getCredibilityLabel(credibilityScore: number) {
  if (credibilityScore >= 0.76) {
    return "High credibility";
  }

  if (credibilityScore >= 0.56) {
    return "Evidence-backed";
  }

  return "Growing profile";
}

function resolveBaseUrl(baseUrlOptional?: string) {
  return baseUrlOptional ?? "https://taid.local";
}

function buildShareUrl(baseUrlOptional: string | undefined, publicShareToken: string) {
  if (baseUrlOptional) {
    return new URL(`/share/${publicShareToken}`, resolveBaseUrl(baseUrlOptional)).toString();
  }

  return `/share/${publicShareToken}`;
}

function normalizeLookup(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function resolveLookupMatch(args: {
  lookup: string;
  candidateId: string;
  careerId: string;
  shareProfileId: string | null;
  publicShareToken: string | null;
}): EmployerCandidateTraceResolvedBy {
  const normalizedLookup = normalizeLookup(args.lookup);

  if (normalizedLookup.toUpperCase() === args.careerId.toUpperCase()) {
    return "career_id";
  }

  if (normalizedLookup === args.candidateId) {
    return "candidate_id";
  }

  if (args.shareProfileId && normalizedLookup.toLowerCase() === args.shareProfileId.toLowerCase()) {
    return "share_profile_id";
  }

  return "share_token";
}

function canExposeEmploymentDetails(args: {
  recruiterVisibility: "limited" | "private" | "searchable";
  showEmploymentRecords: boolean;
}) {
  return args.recruiterVisibility === "searchable" && args.showEmploymentRecords;
}

function toVisibleEmploymentRecord(args: {
  details: Awaited<ReturnType<typeof listClaimDetails>>[number];
  showStatusLabels: boolean;
}): RecruiterEmploymentRecordViewDto {
  return {
    artifactCount: args.details.artifactIds.length,
    claimId: args.details.claimId,
    confidenceTierOptional: args.showStatusLabels
      ? args.details.verification.confidence_tier
      : null,
    currentlyEmployed: args.details.employmentRecord.currently_employed,
    employerName: args.details.employmentRecord.employer_name,
    endDateOptional: args.details.employmentRecord.end_date_optional,
    lastUpdatedAt: args.details.verification.updated_at,
    roleTitle: args.details.employmentRecord.role_title,
    sourceLabelOptional: args.showStatusLabels
      ? args.details.verification.source_label
      : null,
    startDate: args.details.employmentRecord.start_date,
    verificationStatusOptional: args.showStatusLabels
      ? args.details.verification.status
      : null,
  };
}

function toTraceEvidenceRecord(args: {
  canExposeArtifactPreviews: boolean;
  canExposeEmploymentDetails: boolean;
  record: CareerEvidenceRecord;
}) {
  return {
    completionTier: args.record.completionTier,
    createdAt: args.record.createdAt,
    fileCount: args.record.files.length,
    files: args.canExposeArtifactPreviews ? args.record.files : [],
    id: args.record.id,
    issuedOn: args.record.issuedOn,
    sourceOrIssuer: args.canExposeEmploymentDetails ? args.record.sourceOrIssuer : null,
    status: args.record.status,
    templateId: args.record.templateId,
    updatedAt: args.record.updatedAt,
    validationContext: args.record.validationContext,
    whyItMatters: args.record.whyItMatters,
  };
}

export async function getEmployerCandidateTrace(args: {
  input: {
    lookup: string;
    baseUrlOptional?: string;
  };
  correlationId: string;
}) {
  const input = employerCandidateTraceInputSchema.parse(args.input);

  if (shouldAutoloadRecruiterDemoDataset()) {
    try {
      await ensureRecruiterDemoDatasetLoaded();
    } catch {
      // Fall back to whatever live data is already available.
    }
  }

  const projection = await findPersistentRecruiterCandidateProjectionByLookup({
    lookup: input.lookup,
  });

  if (!projection) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "No recruiter-safe candidate matched that lookup.",
      details: {
        lookup: input.lookup,
      },
      correlationId: args.correlationId,
    });
  }

  const context = await findPersistentContextByTalentIdentityId({
    correlationId: args.correlationId,
    talentIdentityId: projection.candidateId,
  });
  const profile = await getPersistentCareerBuilderProfile({
    careerIdentityId: projection.candidateId,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const evidenceRecords = await listPersistentCareerBuilderEvidence({
    careerIdentityId: projection.candidateId,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const exposeEmploymentDetails = canExposeEmploymentDetails({
    recruiterVisibility: projection.recruiterVisibility,
    showEmploymentRecords: context.aggregate.privacySettings.show_employment_records,
  });
  const exposeArtifactPreviews =
    exposeEmploymentDetails && context.aggregate.privacySettings.show_artifact_previews;
  const visibleEmploymentRecords = exposeEmploymentDetails
    ? (await listClaimDetails({
        correlationId: `candidate-trace:${projection.candidateId}`,
        soulRecordIdOptional: context.aggregate.soulRecord.id,
      })).map((details) =>
        toVisibleEmploymentRecord({
          details,
          showStatusLabels: context.aggregate.privacySettings.show_status_labels,
        }),
      )
    : [];
  const trustProfileUrl = projection.shareProfileUrl;
  const shareUrl = projection.publicShareToken
    ? buildShareUrl(input.baseUrlOptional, projection.publicShareToken)
    : null;

  return employerCandidateTraceResponseSchema.parse({
    actions: {
      careerIdUrl: projection.careerIdUrl,
      profileUrl: projection.profileUrl,
      trustProfileUrl,
    },
    candidate: {
      candidateId: projection.candidateId,
      careerId: projection.careerId,
      currentEmployer: projection.currentEmployer,
      currentRole: projection.currentRole,
      fullName: projection.fullName,
      headline: projection.headline,
      location: projection.location,
      profileSummary: projection.profileSummary,
      recruiterVisibility: projection.recruiterVisibility,
      searchable: projection.searchable,
      targetRole: projection.targetRole,
      updatedAt: projection.updatedAt,
    },
    credibility: {
      evidenceCount: projection.evidenceCount,
      label: getCredibilityLabel(projection.credibilityScore),
      score: Math.round(projection.credibilityScore * 100),
      verificationSignal: projection.verificationSignal,
      verifiedExperienceCount: projection.verifiedExperienceCount,
    },
    evidenceRecords: evidenceRecords.map((record) =>
      toTraceEvidenceRecord({
        canExposeArtifactPreviews: exposeArtifactPreviews,
        canExposeEmploymentDetails: exposeEmploymentDetails,
        record,
      }),
    ),
    generatedAt: new Date().toISOString(),
    lookup: {
      resolvedBy: resolveLookupMatch({
        candidateId: projection.candidateId,
        careerId: projection.careerId,
        lookup: input.lookup,
        publicShareToken: projection.publicShareToken,
        shareProfileId: projection.shareProfileId,
      }),
      value: input.lookup,
    },
    onboarding: {
      currentStep: context.onboarding.currentStep,
      profileCompletionPercent: context.onboarding.profileCompletionPercent,
      roleType: context.onboarding.roleType,
      status: context.onboarding.status,
    },
    privacy: {
      allowPublicShareLink: context.aggregate.privacySettings.allow_public_share_link,
      allowQrShare: context.aggregate.privacySettings.allow_qr_share,
      showArtifactPreviews: context.aggregate.privacySettings.show_artifact_previews,
      showCertificationRecords: context.aggregate.privacySettings.show_certification_records,
      showEducationRecords: context.aggregate.privacySettings.show_education_records,
      showEmploymentRecords: context.aggregate.privacySettings.show_employment_records,
      showEndorsements: context.aggregate.privacySettings.show_endorsements,
      showStatusLabels: context.aggregate.privacySettings.show_status_labels,
    },
    profile,
    searchProjection: {
      displaySkills: projection.displaySkills,
      experienceHighlights: projection.highlights,
      priorEmployers: projection.priorEmployers,
      searchText: projection.searchText,
      searchableKeywords: projection.skillTerms,
    },
    shareProfile: {
      publicShareToken: projection.publicShareToken,
      shareProfileId: projection.shareProfileId,
      shareUrl,
      trustProfileUrl,
    },
    visibleEmploymentRecords,
  });
}
