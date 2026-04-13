import {
  claimDetailsDtoSchema,
  claimSchema,
  employmentRecordSchema,
  provenanceRecordSchema,
  verificationRecordSchema,
  type Claim,
  type ClaimDetailsDto,
  type EmploymentRecord,
  type ProvenanceRecord,
  type VerificationRecord,
} from "@/packages/contracts/src";
import { getDatabasePool, isDatabaseConfigured, queryOptional, withDatabaseTransaction } from "./client";

type ClaimRow = {
  id: string;
  soul_record_id: string;
  claim_type: Claim["claim_type"];
  title: string;
  summary: string;
  self_reported_payload_json: Record<string, unknown> | null;
  current_verification_record_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type EmploymentRecordRow = {
  id: string;
  claim_id: string;
  employer_name: string;
  employer_domain_optional: string | null;
  role_title: string;
  employment_type_optional: string | null;
  start_date: string;
  end_date_optional: string | null;
  currently_employed: boolean;
  location_optional: string | null;
  signatory_name_optional: string | null;
  signatory_title_optional: string | null;
  company_letterhead_detected_optional: boolean | null;
  document_date_optional: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type VerificationRecordRow = {
  id: string;
  claim_id: string;
  status: VerificationRecord["status"];
  confidence_tier: VerificationRecord["confidence_tier"];
  primary_method: VerificationRecord["primary_method"];
  source_label: string;
  source_reference_optional: string | null;
  reviewer_actor_id_optional: string | null;
  reviewed_at_optional: Date | string | null;
  expires_at_optional: Date | string | null;
  notes_optional: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProvenanceRecordRow = {
  id: string;
  verification_record_id: string;
  artifact_id_optional: string | null;
  source_actor_type: string;
  source_actor_id_optional: string | null;
  source_method: ProvenanceRecord["source_method"];
  source_details_json: Record<string, unknown> | null;
  created_at: Date | string;
};

type ClaimDetailsJoinRow = {
  claim_created_at: Date | string;
  claim_current_verification_record_id: string | null;
  claim_id: string;
  claim_self_reported_payload_json: Record<string, unknown> | null;
  claim_soul_record_id: string;
  claim_summary: string;
  claim_title: string;
  claim_type: Claim["claim_type"];
  claim_updated_at: Date | string;
  employment_company_letterhead_detected_optional: boolean | null;
  employment_created_at: Date | string;
  employment_currently_employed: boolean;
  employment_document_date_optional: string | null;
  employment_employer_domain_optional: string | null;
  employment_employer_name: string;
  employment_employment_type_optional: string | null;
  employment_end_date_optional: string | null;
  employment_id: string;
  employment_location_optional: string | null;
  employment_role_title: string;
  employment_signatory_name_optional: string | null;
  employment_signatory_title_optional: string | null;
  employment_start_date: string;
  employment_updated_at: Date | string;
  verification_claim_id: string;
  verification_confidence_tier: VerificationRecord["confidence_tier"];
  verification_created_at: Date | string;
  verification_expires_at_optional: Date | string | null;
  verification_id: string;
  verification_notes_optional: string | null;
  verification_primary_method: VerificationRecord["primary_method"];
  verification_reviewed_at_optional: Date | string | null;
  verification_reviewer_actor_id_optional: string | null;
  verification_source_label: string;
  verification_source_reference_optional: string | null;
  verification_status: VerificationRecord["status"];
  verification_updated_at: Date | string;
};

function isDurableTrustStorageExplicitlyDisabled() {
  const configuredValue = process.env.CAREER_AI_USE_DURABLE_TRUST_STORAGE?.trim().toLowerCase();
  return configuredValue === "0" || configuredValue === "false";
}

export function isDurableTrustStorageEnabled() {
  return isDatabaseConfigured() && !isDurableTrustStorageExplicitlyDisabled();
}

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapClaimRow(row: ClaimRow): Claim {
  return claimSchema.parse({
    id: row.id,
    soul_record_id: row.soul_record_id,
    claim_type: row.claim_type,
    title: row.title,
    summary: row.summary,
    self_reported_payload_json: row.self_reported_payload_json ?? {},
    current_verification_record_id: row.current_verification_record_id ?? "",
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  });
}

function mapEmploymentRecordRow(row: EmploymentRecordRow): EmploymentRecord {
  return employmentRecordSchema.parse({
    id: row.id,
    claim_id: row.claim_id,
    employer_name: row.employer_name,
    employer_domain_optional: row.employer_domain_optional,
    role_title: row.role_title,
    employment_type_optional: row.employment_type_optional,
    start_date: row.start_date,
    end_date_optional: row.end_date_optional,
    currently_employed: row.currently_employed,
    location_optional: row.location_optional,
    signatory_name_optional: row.signatory_name_optional,
    signatory_title_optional: row.signatory_title_optional,
    company_letterhead_detected_optional: row.company_letterhead_detected_optional,
    document_date_optional: row.document_date_optional,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  });
}

function mapVerificationRecordRow(row: VerificationRecordRow): VerificationRecord {
  return verificationRecordSchema.parse({
    id: row.id,
    claim_id: row.claim_id,
    status: row.status,
    confidence_tier: row.confidence_tier,
    primary_method: row.primary_method,
    source_label: row.source_label,
    source_reference_optional: row.source_reference_optional,
    reviewer_actor_id_optional: row.reviewer_actor_id_optional,
    reviewed_at_optional: toIsoString(row.reviewed_at_optional),
    expires_at_optional: toIsoString(row.expires_at_optional),
    notes_optional: row.notes_optional,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  });
}

function mapProvenanceRecordRow(row: ProvenanceRecordRow): ProvenanceRecord {
  return provenanceRecordSchema.parse({
    id: row.id,
    verification_record_id: row.verification_record_id,
    artifact_id_optional: row.artifact_id_optional,
    source_actor_type: row.source_actor_type,
    source_actor_id_optional: row.source_actor_id_optional,
    source_method: row.source_method,
    source_details_json: row.source_details_json ?? {},
    created_at: toIsoString(row.created_at),
  });
}

function mapClaimDetailsRow(row: ClaimDetailsJoinRow): Omit<ClaimDetailsDto, "artifactIds"> {
  return claimDetailsDtoSchema
    .omit({ artifactIds: true })
    .parse({
      claimId: row.claim_id,
      claimType: row.claim_type,
      title: row.claim_title,
      summary: row.claim_summary,
      verification: mapVerificationRecordRow({
        id: row.verification_id,
        claim_id: row.verification_claim_id,
        status: row.verification_status,
        confidence_tier: row.verification_confidence_tier,
        primary_method: row.verification_primary_method,
        source_label: row.verification_source_label,
        source_reference_optional: row.verification_source_reference_optional,
        reviewer_actor_id_optional: row.verification_reviewer_actor_id_optional,
        reviewed_at_optional: row.verification_reviewed_at_optional,
        expires_at_optional: row.verification_expires_at_optional,
        notes_optional: row.verification_notes_optional,
        created_at: row.verification_created_at,
        updated_at: row.verification_updated_at,
      }),
      employmentRecord: mapEmploymentRecordRow({
        id: row.employment_id,
        claim_id: row.claim_id,
        employer_name: row.employment_employer_name,
        employer_domain_optional: row.employment_employer_domain_optional,
        role_title: row.employment_role_title,
        employment_type_optional: row.employment_employment_type_optional,
        start_date: row.employment_start_date,
        end_date_optional: row.employment_end_date_optional,
        currently_employed: row.employment_currently_employed,
        location_optional: row.employment_location_optional,
        signatory_name_optional: row.employment_signatory_name_optional,
        signatory_title_optional: row.employment_signatory_title_optional,
        company_letterhead_detected_optional:
          row.employment_company_letterhead_detected_optional,
        document_date_optional: row.employment_document_date_optional,
        created_at: row.employment_created_at,
        updated_at: row.employment_updated_at,
      }),
      createdAt: toIsoString(row.claim_created_at),
      updatedAt: toIsoString(row.claim_updated_at),
    });
}

export async function createPersistentEmploymentClaimRecord(args: {
  claim: Claim;
  employmentRecord: EmploymentRecord;
  verificationRecord: VerificationRecord;
}) {
  return withDatabaseTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO claims (
          id,
          soul_record_id,
          claim_type,
          title,
          summary,
          self_reported_payload_json,
          current_verification_record_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      `,
      [
        args.claim.id,
        args.claim.soul_record_id,
        args.claim.claim_type,
        args.claim.title,
        args.claim.summary,
        JSON.stringify(args.claim.self_reported_payload_json ?? {}),
        null,
        args.claim.created_at,
        args.claim.updated_at,
      ],
    );

    await client.query(
      `
        INSERT INTO employment_records (
          id,
          claim_id,
          employer_name,
          employer_domain_optional,
          role_title,
          employment_type_optional,
          start_date,
          end_date_optional,
          currently_employed,
          location_optional,
          signatory_name_optional,
          signatory_title_optional,
          company_letterhead_detected_optional,
          document_date_optional,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      [
        args.employmentRecord.id,
        args.employmentRecord.claim_id,
        args.employmentRecord.employer_name,
        args.employmentRecord.employer_domain_optional,
        args.employmentRecord.role_title,
        args.employmentRecord.employment_type_optional,
        args.employmentRecord.start_date,
        args.employmentRecord.end_date_optional,
        args.employmentRecord.currently_employed,
        args.employmentRecord.location_optional,
        args.employmentRecord.signatory_name_optional,
        args.employmentRecord.signatory_title_optional,
        args.employmentRecord.company_letterhead_detected_optional,
        args.employmentRecord.document_date_optional,
        args.employmentRecord.created_at,
        args.employmentRecord.updated_at,
      ],
    );

    await client.query(
      `
        INSERT INTO verification_records (
          id,
          claim_id,
          status,
          confidence_tier,
          primary_method,
          source_label,
          source_reference_optional,
          reviewer_actor_id_optional,
          reviewed_at_optional,
          expires_at_optional,
          notes_optional,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        args.verificationRecord.id,
        args.verificationRecord.claim_id,
        args.verificationRecord.status,
        args.verificationRecord.confidence_tier,
        args.verificationRecord.primary_method,
        args.verificationRecord.source_label,
        args.verificationRecord.source_reference_optional,
        args.verificationRecord.reviewer_actor_id_optional,
        args.verificationRecord.reviewed_at_optional,
        args.verificationRecord.expires_at_optional,
        args.verificationRecord.notes_optional,
        args.verificationRecord.created_at,
        args.verificationRecord.updated_at,
      ],
    );

    await client.query(
      `
        UPDATE claims
        SET
          current_verification_record_id = $2,
          updated_at = $3
        WHERE id = $1
      `,
      [args.claim.id, args.verificationRecord.id, args.verificationRecord.updated_at],
    );

    return {
      claim: {
        ...args.claim,
        current_verification_record_id: args.verificationRecord.id,
      },
      employmentRecord: args.employmentRecord,
      verificationRecord: args.verificationRecord,
    };
  });
}

export async function createPersistentVerificationRecord(args: {
  record: VerificationRecord;
}) {
  const result = await getDatabasePool().query<VerificationRecordRow>(
    `
      INSERT INTO verification_records (
        id,
        claim_id,
        status,
        confidence_tier,
        primary_method,
        source_label,
        source_reference_optional,
        reviewer_actor_id_optional,
        reviewed_at_optional,
        expires_at_optional,
        notes_optional,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING
        id,
        claim_id,
        status,
        confidence_tier,
        primary_method,
        source_label,
        source_reference_optional,
        reviewer_actor_id_optional,
        reviewed_at_optional,
        expires_at_optional,
        notes_optional,
        created_at,
        updated_at
    `,
    [
      args.record.id,
      args.record.claim_id,
      args.record.status,
      args.record.confidence_tier,
      args.record.primary_method,
      args.record.source_label,
      args.record.source_reference_optional,
      args.record.reviewer_actor_id_optional,
      args.record.reviewed_at_optional,
      args.record.expires_at_optional,
      args.record.notes_optional,
      args.record.created_at,
      args.record.updated_at,
    ],
  );

  await getDatabasePool().query(
    `
      UPDATE claims
      SET
        current_verification_record_id = $2,
        updated_at = $3
      WHERE id = $1
    `,
    [args.record.claim_id, args.record.id, args.record.updated_at],
  );

  return mapVerificationRecordRow(result.rows[0]);
}

export async function findPersistentClaim(args: {
  claimId: string;
}) {
  const row = await queryOptional<ClaimRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        soul_record_id,
        claim_type,
        title,
        summary,
        self_reported_payload_json,
        current_verification_record_id,
        created_at,
        updated_at
      FROM claims
      WHERE id = $1
    `,
    [args.claimId],
  );

  return row ? mapClaimRow(row) : null;
}

export async function findPersistentVerificationRecordById(args: {
  verificationRecordId: string;
}) {
  const row = await queryOptional<VerificationRecordRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        claim_id,
        status,
        confidence_tier,
        primary_method,
        source_label,
        source_reference_optional,
        reviewer_actor_id_optional,
        reviewed_at_optional,
        expires_at_optional,
        notes_optional,
        created_at,
        updated_at
      FROM verification_records
      WHERE id = $1
    `,
    [args.verificationRecordId],
  );

  return row ? mapVerificationRecordRow(row) : null;
}

export async function findPersistentVerificationRecordByClaimId(args: {
  claimId: string;
}) {
  const row = await queryOptional<VerificationRecordRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        claim_id,
        status,
        confidence_tier,
        primary_method,
        source_label,
        source_reference_optional,
        reviewer_actor_id_optional,
        reviewed_at_optional,
        expires_at_optional,
        notes_optional,
        created_at,
        updated_at
      FROM verification_records
      WHERE claim_id = $1
    `,
    [args.claimId],
  );

  return row ? mapVerificationRecordRow(row) : null;
}

export async function updatePersistentVerificationRecord(args: {
  record: VerificationRecord;
}) {
  const row = await queryOptional<VerificationRecordRow>(
    getDatabasePool(),
    `
      UPDATE verification_records
      SET
        status = $2,
        confidence_tier = $3,
        primary_method = $4,
        source_label = $5,
        source_reference_optional = $6,
        reviewer_actor_id_optional = $7,
        reviewed_at_optional = $8,
        expires_at_optional = $9,
        notes_optional = $10,
        updated_at = $11
      WHERE id = $1
      RETURNING
        id,
        claim_id,
        status,
        confidence_tier,
        primary_method,
        source_label,
        source_reference_optional,
        reviewer_actor_id_optional,
        reviewed_at_optional,
        expires_at_optional,
        notes_optional,
        created_at,
        updated_at
    `,
    [
      args.record.id,
      args.record.status,
      args.record.confidence_tier,
      args.record.primary_method,
      args.record.source_label,
      args.record.source_reference_optional,
      args.record.reviewer_actor_id_optional,
      args.record.reviewed_at_optional,
      args.record.expires_at_optional,
      args.record.notes_optional,
      args.record.updated_at,
    ],
  );

  return row ? mapVerificationRecordRow(row) : null;
}

export async function createPersistentProvenanceRecord(args: {
  record: ProvenanceRecord;
}) {
  const result = await getDatabasePool().query<ProvenanceRecordRow>(
    `
      INSERT INTO verification_provenance_records (
        id,
        verification_record_id,
        artifact_id_optional,
        source_actor_type,
        source_actor_id_optional,
        source_method,
        source_details_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      RETURNING
        id,
        verification_record_id,
        artifact_id_optional,
        source_actor_type,
        source_actor_id_optional,
        source_method,
        source_details_json,
        created_at
    `,
    [
      args.record.id,
      args.record.verification_record_id,
      args.record.artifact_id_optional,
      args.record.source_actor_type,
      args.record.source_actor_id_optional,
      args.record.source_method,
      JSON.stringify(args.record.source_details_json ?? {}),
      args.record.created_at,
    ],
  );

  return mapProvenanceRecordRow(result.rows[0]);
}

export async function listPersistentProvenanceRecords(args: {
  verificationRecordId: string;
}) {
  const result = await getDatabasePool().query<ProvenanceRecordRow>(
    `
      SELECT
        id,
        verification_record_id,
        artifact_id_optional,
        source_actor_type,
        source_actor_id_optional,
        source_method,
        source_details_json,
        created_at
      FROM verification_provenance_records
      WHERE verification_record_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [args.verificationRecordId],
  );

  return result.rows.map(mapProvenanceRecordRow);
}

async function listClaimDetailsRows(args: {
  soulRecordIdOptional?: string;
}) {
  const result = await getDatabasePool().query<ClaimDetailsJoinRow>(
    `
      SELECT
        c.id AS claim_id,
        c.soul_record_id AS claim_soul_record_id,
        c.claim_type AS claim_type,
        c.title AS claim_title,
        c.summary AS claim_summary,
        c.self_reported_payload_json AS claim_self_reported_payload_json,
        c.current_verification_record_id AS claim_current_verification_record_id,
        c.created_at AS claim_created_at,
        c.updated_at AS claim_updated_at,
        e.id AS employment_id,
        e.employer_name AS employment_employer_name,
        e.employer_domain_optional AS employment_employer_domain_optional,
        e.role_title AS employment_role_title,
        e.employment_type_optional AS employment_employment_type_optional,
        e.start_date AS employment_start_date,
        e.end_date_optional AS employment_end_date_optional,
        e.currently_employed AS employment_currently_employed,
        e.location_optional AS employment_location_optional,
        e.signatory_name_optional AS employment_signatory_name_optional,
        e.signatory_title_optional AS employment_signatory_title_optional,
        e.company_letterhead_detected_optional AS employment_company_letterhead_detected_optional,
        e.document_date_optional AS employment_document_date_optional,
        e.created_at AS employment_created_at,
        e.updated_at AS employment_updated_at,
        v.id AS verification_id,
        v.claim_id AS verification_claim_id,
        v.status AS verification_status,
        v.confidence_tier AS verification_confidence_tier,
        v.primary_method AS verification_primary_method,
        v.source_label AS verification_source_label,
        v.source_reference_optional AS verification_source_reference_optional,
        v.reviewer_actor_id_optional AS verification_reviewer_actor_id_optional,
        v.reviewed_at_optional AS verification_reviewed_at_optional,
        v.expires_at_optional AS verification_expires_at_optional,
        v.notes_optional AS verification_notes_optional,
        v.created_at AS verification_created_at,
        v.updated_at AS verification_updated_at
      FROM claims c
      INNER JOIN employment_records e ON e.claim_id = c.id
      INNER JOIN verification_records v ON v.claim_id = c.id
      WHERE c.soul_record_id = COALESCE($1, c.soul_record_id)
      ORDER BY c.created_at ASC, c.id ASC
    `,
    [args.soulRecordIdOptional ?? null],
  );

  return result.rows;
}

export async function findPersistentClaimDetails(args: {
  claimId: string;
}) {
  const row = await queryOptional<ClaimDetailsJoinRow>(
    getDatabasePool(),
    `
      SELECT
        c.id AS claim_id,
        c.soul_record_id AS claim_soul_record_id,
        c.claim_type AS claim_type,
        c.title AS claim_title,
        c.summary AS claim_summary,
        c.self_reported_payload_json AS claim_self_reported_payload_json,
        c.current_verification_record_id AS claim_current_verification_record_id,
        c.created_at AS claim_created_at,
        c.updated_at AS claim_updated_at,
        e.id AS employment_id,
        e.employer_name AS employment_employer_name,
        e.employer_domain_optional AS employment_employer_domain_optional,
        e.role_title AS employment_role_title,
        e.employment_type_optional AS employment_employment_type_optional,
        e.start_date AS employment_start_date,
        e.end_date_optional AS employment_end_date_optional,
        e.currently_employed AS employment_currently_employed,
        e.location_optional AS employment_location_optional,
        e.signatory_name_optional AS employment_signatory_name_optional,
        e.signatory_title_optional AS employment_signatory_title_optional,
        e.company_letterhead_detected_optional AS employment_company_letterhead_detected_optional,
        e.document_date_optional AS employment_document_date_optional,
        e.created_at AS employment_created_at,
        e.updated_at AS employment_updated_at,
        v.id AS verification_id,
        v.claim_id AS verification_claim_id,
        v.status AS verification_status,
        v.confidence_tier AS verification_confidence_tier,
        v.primary_method AS verification_primary_method,
        v.source_label AS verification_source_label,
        v.source_reference_optional AS verification_source_reference_optional,
        v.reviewer_actor_id_optional AS verification_reviewer_actor_id_optional,
        v.reviewed_at_optional AS verification_reviewed_at_optional,
        v.expires_at_optional AS verification_expires_at_optional,
        v.notes_optional AS verification_notes_optional,
        v.created_at AS verification_created_at,
        v.updated_at AS verification_updated_at
      FROM claims c
      INNER JOIN employment_records e ON e.claim_id = c.id
      INNER JOIN verification_records v ON v.claim_id = c.id
      WHERE c.id = $1
    `,
    [args.claimId],
  );

  return row ? mapClaimDetailsRow(row) : null;
}

export async function listPersistentClaimDetails(args: {
  soulRecordIdOptional?: string;
}) {
  const rows = await listClaimDetailsRows(args);
  return rows.map((row) => mapClaimDetailsRow(row));
}

export async function getPersistentClaimVerificationMetrics() {
  const result = await getDatabasePool().query<{
    claims_count: string;
    employment_records_count: string;
    verification_records_count: string;
    provenance_count: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM claims) AS claims_count,
      (SELECT COUNT(*)::text FROM employment_records) AS employment_records_count,
      (SELECT COUNT(*)::text FROM verification_records) AS verification_records_count,
      (SELECT COUNT(*)::text FROM verification_provenance_records) AS provenance_count
  `);

  return {
    claims: Number(result.rows[0]?.claims_count ?? 0),
    employmentRecords: Number(result.rows[0]?.employment_records_count ?? 0),
    provenanceEntries: Number(result.rows[0]?.provenance_count ?? 0),
    verificationRecords: Number(result.rows[0]?.verification_records_count ?? 0),
  };
}
