import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTalentIdentity } from "@/packages/identity-domain/src";
import {
  createPersistentEmploymentClaimRecord,
  createPersistentProvenanceRecord,
  findPersistentClaim,
  findPersistentClaimDetails,
  findPersistentVerificationRecordByClaimId,
  findPersistentVerificationRecordById,
  getPersistentClaimVerificationMetrics,
  listPersistentClaimDetails,
  listPersistentProvenanceRecords,
  updatePersistentVerificationRecord,
} from "./claim-verification-repository";
import { installTestDatabase, resetTestDatabase } from "./test-helpers";

describe("claim verification repository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  async function seedIdentity() {
    return createTalentIdentity({
      input: {
        countryCode: "US",
        email: "durable-claims@example.com",
        firstName: "Durable",
        lastName: "Claims",
      },
      actorId: "seed",
      actorType: "system_service",
      correlationId: "corr-seed-identity",
    });
  }

  it("persists claim, employment, and verification records durably", async () => {
    const aggregate = await seedIdentity();
    const createdAt = "2026-04-13T12:00:00.000Z";

    await createPersistentEmploymentClaimRecord({
      claim: {
        created_at: createdAt,
        current_verification_record_id: "ver_123",
        claim_type: "EMPLOYMENT",
        id: "claim_123",
        self_reported_payload_json: {
          employerName: "Acme",
        },
        soul_record_id: aggregate.soulRecord.id,
        summary: "Acme employment from 2021-01-01",
        title: "Senior Engineer at Acme",
        updated_at: createdAt,
      },
      employmentRecord: {
        claim_id: "claim_123",
        company_letterhead_detected_optional: true,
        created_at: createdAt,
        currently_employed: false,
        document_date_optional: "2024-01-01",
        employer_domain_optional: "acme.com",
        employer_name: "Acme",
        employment_type_optional: "Full-time",
        end_date_optional: "2024-01-01",
        id: "emp_123",
        location_optional: "Austin, TX",
        role_title: "Senior Engineer",
        signatory_name_optional: "Alex HR",
        signatory_title_optional: "HR Director",
        start_date: "2021-01-01",
        updated_at: createdAt,
      },
      verificationRecord: {
        claim_id: "claim_123",
        confidence_tier: "SELF_REPORTED",
        created_at: createdAt,
        expires_at_optional: null,
        id: "ver_123",
        notes_optional: null,
        primary_method: "USER_UPLOAD",
        reviewed_at_optional: null,
        reviewer_actor_id_optional: null,
        source_label: "candidate_self_report",
        source_reference_optional: null,
        status: "SUBMITTED",
        updated_at: createdAt,
      },
    });

    await expect(findPersistentClaim({ claimId: "claim_123" })).resolves.toMatchObject({
      current_verification_record_id: "ver_123",
      id: "claim_123",
      soul_record_id: aggregate.soulRecord.id,
    });
    await expect(findPersistentClaimDetails({ claimId: "claim_123" })).resolves.toMatchObject({
      claimId: "claim_123",
      employmentRecord: {
        employer_name: "Acme",
      },
      verification: {
        id: "ver_123",
        status: "SUBMITTED",
      },
    });
    await expect(
      listPersistentClaimDetails({
        soulRecordIdOptional: aggregate.soulRecord.id,
      }),
    ).resolves.toHaveLength(1);
  });

  it("persists verification updates and provenance entries", async () => {
    const aggregate = await seedIdentity();
    const createdAt = "2026-04-13T12:00:00.000Z";

    await createPersistentEmploymentClaimRecord({
      claim: {
        created_at: createdAt,
        current_verification_record_id: "ver_456",
        claim_type: "EMPLOYMENT",
        id: "claim_456",
        self_reported_payload_json: {},
        soul_record_id: aggregate.soulRecord.id,
        summary: "Signal Labs employment",
        title: "Program Manager at Signal Labs",
        updated_at: createdAt,
      },
      employmentRecord: {
        claim_id: "claim_456",
        company_letterhead_detected_optional: null,
        created_at: createdAt,
        currently_employed: true,
        document_date_optional: null,
        employer_domain_optional: null,
        employer_name: "Signal Labs",
        employment_type_optional: null,
        end_date_optional: null,
        id: "emp_456",
        location_optional: "Chicago, IL",
        role_title: "Program Manager",
        signatory_name_optional: null,
        signatory_title_optional: null,
        start_date: "2022-02-01",
        updated_at: createdAt,
      },
      verificationRecord: {
        claim_id: "claim_456",
        confidence_tier: "SELF_REPORTED",
        created_at: createdAt,
        expires_at_optional: null,
        id: "ver_456",
        notes_optional: null,
        primary_method: "USER_UPLOAD",
        reviewed_at_optional: null,
        reviewer_actor_id_optional: null,
        source_label: "candidate_self_report",
        source_reference_optional: null,
        status: "SUBMITTED",
        updated_at: createdAt,
      },
    });

    const updated = await updatePersistentVerificationRecord({
      record: {
        ...(await findPersistentVerificationRecordById({
          verificationRecordId: "ver_456",
        }))!,
        confidence_tier: "REVIEWED",
        notes_optional: "Reviewed by verifier.",
        reviewed_at_optional: "2026-04-13T13:00:00.000Z",
        reviewer_actor_id_optional: "admin_1",
        status: "REVIEWED",
        updated_at: "2026-04-13T13:00:00.000Z",
      },
    });

    expect(updated).toMatchObject({
      confidence_tier: "REVIEWED",
      reviewer_actor_id_optional: "admin_1",
      status: "REVIEWED",
    });
    await expect(
      findPersistentVerificationRecordByClaimId({
        claimId: "claim_456",
      }),
    ).resolves.toMatchObject({
      id: "ver_456",
      status: "REVIEWED",
    });

    await createPersistentProvenanceRecord({
      record: {
        artifact_id_optional: "art_456",
        created_at: "2026-04-13T13:05:00.000Z",
        id: "prov_456",
        source_actor_id_optional: "admin_1",
        source_actor_type: "reviewer_admin",
        source_details_json: {
          note: "Verified uploaded offer letter.",
        },
        source_method: "INTERNAL_REVIEW",
        verification_record_id: "ver_456",
      },
    });

    await expect(
      listPersistentProvenanceRecords({
        verificationRecordId: "ver_456",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "prov_456",
        source_method: "INTERNAL_REVIEW",
      }),
    ]);
    await expect(getPersistentClaimVerificationMetrics()).resolves.toEqual({
      claims: 1,
      employmentRecords: 1,
      provenanceEntries: 1,
      verificationRecords: 1,
    });
  });
});
