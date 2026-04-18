import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApplyRunDto, ApplicationProfileSnapshotDto } from "@/packages/contracts/src";
import {
  claimNextQueuedApplyRun,
  createQueuedApplyRun,
  findApplyRunById,
  findExistingActiveApplyRun,
  findProfileSnapshotById,
  listApplyRunEvents,
} from "./apply-run-repository";
import { getDatabasePool } from "./client";
import { persistSourcedJobs } from "./job-posting-repository";
import { installTestDatabase, resetTestDatabase } from "./test-helpers";

async function seedUser() {
  await getDatabasePool().query(
    `
      INSERT INTO users (
        id,
        email,
        full_name,
        first_name,
        last_name,
        auth_provider,
        provider_user_id,
        email_verified
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      "user_123",
      "stefano@example.com",
      "Stefano Caruso",
      "Stefano",
      "Caruso",
      "test",
      "provider_user_123",
      true,
    ],
  );
}

async function seedJobPosting() {
  await persistSourcedJobs({
    jobs: [
      {
        applyUrl: "https://wd1.myworkdaysite.com/recruiting/example/job/123",
        canonicalApplyUrl: "https://wd1.myworkdaysite.com/recruiting/example/job/123",
        companyName: "Workday",
        commitment: "Full-time",
        department: "Design",
        descriptionSnippet: "Lead the candidate product experience.",
        externalId: "external_123",
        id: "job_123",
        location: "Remote",
        orchestrationReadiness: true,
        postedAt: "2026-04-17T12:00:00.000Z",
        sourceKey: "workday:test",
        sourceLabel: "Workday",
        sourceLane: "ats_direct",
        sourceQuality: "high_signal",
        title: "Senior Product Designer",
        updatedAt: "2026-04-17T12:00:00.000Z",
      },
    ],
    sources: [
      {
        endpointLabel: "wd1.myworkdaysite.com",
        jobCount: 1,
        key: "workday:test",
        label: "Workday",
        lane: "ats_direct",
        lastSyncedAt: "2026-04-17T12:00:00.000Z",
        message: "Direct Workday jobs are flowing.",
        quality: "high_signal",
        status: "connected",
      },
    ],
    syncedAt: "2026-04-17T12:00:00.000Z",
  });
}

function createSnapshot(): ApplicationProfileSnapshotDto {
  return {
    contact: {
      countryPhoneCode: "+1",
      email: "stefano@example.com",
      phone: "5551234567",
    },
    createdAt: "2026-04-17T12:00:00.000Z",
    disclosures: {},
    documents: {
      resume: {
        artifactId: "art_resume_1",
        fileName: "resume.pdf",
        mimeType: "application/pdf",
        parsingStatus: "QUEUED",
        uploadedAt: "2026-04-17T12:00:00.000Z",
      },
    },
    education: [],
    employerSpecificDeltas: {},
    id: "profile_snapshot_test_1",
    identity: {
      email: "stefano@example.com",
      firstName: "Stefano",
      fullName: "Stefano Caruso",
      lastName: "Caruso",
    },
    links: {},
    location: {
      addressLine1: "123 Main St",
      city: "Chicago",
      country: "United States",
      postalCode: "60601",
      region: "IL",
    },
    profileVersion: 1,
    provenance: {
      source: "test",
      sourceUpdatedAt: null,
    },
    schemaFamily: "workday",
    sourceProfile: {
      email: "stefano@example.com",
      first_name: "Stefano",
      last_name: "Caruso",
      resume_cv_file: {
        artifactId: "art_resume_1",
        fileName: "resume.pdf",
        mimeType: "application/pdf",
        parsingStatus: "QUEUED",
        uploadedAt: "2026-04-17T12:00:00.000Z",
      },
    },
    sponsorship: {},
    userId: "user_123",
    workEligibility: {},
    workHistory: [],
  };
}

function createRun(snapshotId: string): Omit<ApplyRunDto, "updatedAt"> {
  return {
    adapterId: null,
    atsFamily: "workday",
    attemptCount: 1,
    companyName: "Workday",
    completedAt: null,
    createdAt: "2026-04-17T12:00:00.000Z",
    failureCode: null,
    failureMessage: null,
    featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
    id: "apply_run_test_1",
    jobId: "job_123",
    jobPostingUrl: "https://wd1.myworkdaysite.com/recruiting/example/job/123",
    jobTitle: "Senior Product Designer",
    metadataJson: {},
    profileSnapshotId: snapshotId,
    startedAt: null,
    status: "queued",
    terminalState: null,
    traceId: null,
    userId: "user_123",
  };
}

describe("apply run repository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    await seedUser();
    await seedJobPosting();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates the snapshot, run, and initial event together", async () => {
    const snapshot = createSnapshot();
    const createdRun = await createQueuedApplyRun({
      run: createRun(snapshot.id),
      snapshot,
    });

    const storedRun = await findApplyRunById({
      runId: createdRun.id,
    });
    const storedSnapshot = await findProfileSnapshotById({
      snapshotId: snapshot.id,
    });
    const events = await listApplyRunEvents({
      runId: createdRun.id,
    });

    expect(storedRun.status).toBe("queued");
    expect(storedSnapshot.documents.resume?.artifactId).toBe("art_resume_1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "apply_run.created",
      state: "queued",
      stepName: "start_apply_run",
    });
  });

  it("claims the next queued run and surfaces it as the active dedupe candidate", async () => {
    const snapshot = createSnapshot();
    await createQueuedApplyRun({
      run: createRun(snapshot.id),
      snapshot,
    });

    const claimedRun = await claimNextQueuedApplyRun();
    const dedupeRun = await findExistingActiveApplyRun({
      jobId: "job_123",
      jobPostingUrl: "https://wd1.myworkdaysite.com/recruiting/example/job/123",
      userId: "user_123",
    });

    expect(claimedRun?.status).toBe("preflight_validating");
    expect(dedupeRun?.id).toBe("apply_run_test_1");
  });
});
