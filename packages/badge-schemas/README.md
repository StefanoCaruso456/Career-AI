# @career-protocol/badge-schemas

W3C Verifiable Credential schemas for the Career Protocol badge taxonomy.

## Badge types (Phase T0 / T1 / T3)

| Type | Phase | Status |
|---|---|---|
| `IdentityCredential` | T1 | Planned |
| `EmploymentCredential` | T2 | Planned |
| `EducationCredential` | T3 | Planned |
| `CertificationCredential` | T3 | Planned |
| `SkillCredential` | T3 | Planned |
| `EndorsementCredential` | T3 | Planned |

## Structure

Each badge type has:

- A JSON Schema under `schemas/<type>/v<N>.json` — normative field definitions
- A JSON-LD context under `schemas/<type>/context-v<N>.jsonld` — for `@context` in the VC
- TypeScript types exported from `src/index.ts` — generated from the JSON Schemas

## Versioning

Schemas are versioned by integer (v1, v2, ...). Once published, a schema version is **immutable**. Fixes require a new version. Credentials reference the schema version they were issued against so verifiers can always resolve the exact schema.

## Identifiers

Schema IDs take the form:
`https://schemas.career-ledger.example/<type>/v<N>`

(Domain TBD — placeholder for now.)
