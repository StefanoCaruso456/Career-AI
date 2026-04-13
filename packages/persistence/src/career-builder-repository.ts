import type {
  CareerArtifactReference,
  CareerEvidenceRecord,
  CareerEvidenceStatus,
  CareerPhase,
  CareerProfileInput,
  CareerProfileRecord,
} from "@/packages/contracts/src";
import {
  getDatabasePool,
  queryOptional,
  queryRequired,
  withDatabaseTransaction,
} from "./client";
import { refreshPersistentRecruiterCandidateProjection } from "./recruiter-candidate-projection-repository";

type CareerBuilderProfileRow = {
  career_identity_id: string;
  legal_name: string;
  career_headline: string;
  target_role: string;
  location: string;
  core_narrative: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type CareerBuilderEvidenceRow = {
  id: string;
  career_identity_id: string;
  template_id: string;
  completion_tier: CareerPhase;
  source_or_issuer: string;
  issued_on: Date | string | null;
  validation_context: string;
  why_it_matters: string;
  status: CareerEvidenceStatus;
  created_at: Date | string;
  updated_at: Date | string;
};

type CareerBuilderEvidenceFileRow = {
  id: string;
  evidence_id: string;
  artifact_id: string;
  name: string;
  size_label: string;
  mime_type: string;
  uploaded_at: Date | string;
  slot: "front" | "back" | null;
  created_at: Date | string;
};

function formatIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatDateOnly(value: Date | string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function mapProfileRow(
  row: CareerBuilderProfileRow,
  soulRecordId: string,
): CareerProfileRecord {
  return {
    talentIdentityId: row.career_identity_id,
    soulRecordId,
    legalName: row.legal_name,
    careerHeadline: row.career_headline,
    targetRole: row.target_role,
    location: row.location,
    coreNarrative: row.core_narrative,
    createdAt: formatIsoString(row.created_at),
    updatedAt: formatIsoString(row.updated_at),
  };
}

function mapEvidenceFileRow(row: CareerBuilderEvidenceFileRow): CareerArtifactReference {
  return {
    artifactId: row.artifact_id,
    name: row.name,
    sizeLabel: row.size_label,
    mimeType: row.mime_type,
    uploadedAt: formatIsoString(row.uploaded_at),
    slot: row.slot ?? undefined,
  };
}

function mapEvidenceRow(
  row: CareerBuilderEvidenceRow,
  soulRecordId: string,
  files: CareerArtifactReference[],
): CareerEvidenceRecord {
  return {
    id: row.id,
    talentIdentityId: row.career_identity_id,
    soulRecordId,
    templateId: row.template_id as CareerEvidenceRecord["templateId"],
    completionTier: row.completion_tier,
    sourceOrIssuer: row.source_or_issuer,
    issuedOn: formatDateOnly(row.issued_on),
    validationContext: row.validation_context,
    whyItMatters: row.why_it_matters,
    files,
    status: row.status,
    createdAt: formatIsoString(row.created_at),
    updatedAt: formatIsoString(row.updated_at),
  };
}

export async function getPersistentCareerBuilderProfile(args: {
  careerIdentityId: string;
  soulRecordId: string;
}) {
  const row = await queryOptional<CareerBuilderProfileRow>(
    getDatabasePool(),
    `
      SELECT
        career_identity_id,
        legal_name,
        career_headline,
        target_role,
        location,
        core_narrative,
        created_at,
        updated_at
      FROM career_builder_profiles
      WHERE career_identity_id = $1
    `,
    [args.careerIdentityId],
  );

  return row ? mapProfileRow(row, args.soulRecordId) : null;
}

export async function listPersistentCareerBuilderEvidence(args: {
  careerIdentityId: string;
  soulRecordId: string;
}) {
  const pool = getDatabasePool();
  const evidenceRows = await pool.query<CareerBuilderEvidenceRow>(
    `
      SELECT
        id,
        career_identity_id,
        template_id,
        completion_tier,
        source_or_issuer,
        issued_on,
        validation_context,
        why_it_matters,
        status,
        created_at,
        updated_at
      FROM career_builder_evidence
      WHERE career_identity_id = $1
      ORDER BY created_at ASC, template_id ASC
    `,
    [args.careerIdentityId],
  );

  if ((evidenceRows.rowCount ?? 0) === 0) {
    return [];
  }

  const evidence = [];

  for (const row of evidenceRows.rows) {
    const fileRows = await pool.query<CareerBuilderEvidenceFileRow>(
      `
        SELECT
          id,
          evidence_id,
          artifact_id,
          name,
          size_label,
          mime_type,
          uploaded_at,
          slot,
          created_at
        FROM career_builder_evidence_files
        WHERE evidence_id = $1
        ORDER BY
          CASE slot WHEN 'front' THEN 0 WHEN 'back' THEN 1 ELSE 2 END,
          created_at ASC
      `,
      [row.id],
    );

    evidence.push(
      mapEvidenceRow(
        row,
        args.soulRecordId,
        fileRows.rows.map((fileRow) => mapEvidenceFileRow(fileRow)),
      ),
    );
  }

  return evidence;
}

export async function upsertPersistentCareerBuilderProfile(args: {
  careerIdentityId: string;
  soulRecordId: string;
  input: CareerProfileInput;
  skipProjectionRefreshOptional?: boolean;
}) {
  return withDatabaseTransaction(async (client) => {
    const row = await queryRequired<CareerBuilderProfileRow>(
      client,
      `
        INSERT INTO career_builder_profiles (
          career_identity_id,
          legal_name,
          career_headline,
          target_role,
          location,
          core_narrative,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (career_identity_id)
        DO UPDATE SET
          legal_name = EXCLUDED.legal_name,
          career_headline = EXCLUDED.career_headline,
          target_role = EXCLUDED.target_role,
          location = EXCLUDED.location,
          core_narrative = EXCLUDED.core_narrative,
          updated_at = NOW()
        RETURNING
          career_identity_id,
          legal_name,
          career_headline,
          target_role,
          location,
          core_narrative,
          created_at,
          updated_at
      `,
      [
        args.careerIdentityId,
        args.input.legalName,
        args.input.careerHeadline,
        args.input.targetRole,
        args.input.location,
        args.input.coreNarrative,
      ],
    );

    if (!args.skipProjectionRefreshOptional) {
      await refreshPersistentRecruiterCandidateProjection({
        careerIdentityId: args.careerIdentityId,
        queryable: client,
      });
    }

    return mapProfileRow(row, args.soulRecordId);
  });
}

export async function upsertPersistentCareerBuilderEvidence(args: {
  careerIdentityId: string;
  soulRecordId: string;
  record: CareerEvidenceRecord;
  skipProjectionRefreshOptional?: boolean;
}) {
  return withDatabaseTransaction(async (client) => {
    const row = await queryRequired<CareerBuilderEvidenceRow>(
      client,
      `
        INSERT INTO career_builder_evidence (
          id,
          career_identity_id,
          template_id,
          completion_tier,
          source_or_issuer,
          issued_on,
          validation_context,
          why_it_matters,
          status,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (career_identity_id, template_id)
        DO UPDATE SET
          completion_tier = EXCLUDED.completion_tier,
          source_or_issuer = EXCLUDED.source_or_issuer,
          issued_on = EXCLUDED.issued_on,
          validation_context = EXCLUDED.validation_context,
          why_it_matters = EXCLUDED.why_it_matters,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING
          id,
          career_identity_id,
          template_id,
          completion_tier,
          source_or_issuer,
          issued_on,
          validation_context,
          why_it_matters,
          status,
          created_at,
          updated_at
      `,
      [
        args.record.id,
        args.careerIdentityId,
        args.record.templateId,
        args.record.completionTier,
        args.record.sourceOrIssuer,
        args.record.issuedOn || null,
        args.record.validationContext,
        args.record.whyItMatters,
        args.record.status,
      ],
    );

    await client.query("DELETE FROM career_builder_evidence_files WHERE evidence_id = $1", [row.id]);

    for (const file of args.record.files) {
      await client.query(
        `
          INSERT INTO career_builder_evidence_files (
            id,
            evidence_id,
            artifact_id,
            name,
            size_label,
            mime_type,
            uploaded_at,
            slot
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          `career_evidence_file_${crypto.randomUUID()}`,
          row.id,
          file.artifactId,
          file.name,
          file.sizeLabel,
          file.mimeType,
          file.uploadedAt,
          file.slot ?? null,
        ],
      );
    }

    const files = args.record.files;

    if (!args.skipProjectionRefreshOptional) {
      await refreshPersistentRecruiterCandidateProjection({
        careerIdentityId: args.careerIdentityId,
        queryable: client,
      });
    }

    return mapEvidenceRow(row, args.soulRecordId, files);
  });
}
