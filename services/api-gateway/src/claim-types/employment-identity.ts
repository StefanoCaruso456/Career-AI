/**
 * Shared identity-normalization helpers for handlers in the `employment`
 * group (offer-letter, employment-verification, future W-2-specific types).
 *
 * Lineage collapse across handlers requires every handler in the group to
 * produce BYTE-IDENTICAL identity strings for the same (employer, role).
 * Keep these functions pure and centralized so a tweak to one is a tweak
 * to all.
 */

export function normalizeEmployer(employer: string): string {
  return employer
    .toLowerCase()
    .replace(
      /\b(inc\.?|incorporated|llc|l\.l\.c\.|corp\.?|corporation|ltd\.?|limited|gmbh|co\.?|company)\b/gi,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeRole(role: string): string {
  return role.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildEmploymentLineageIdentity(params: {
  employer: string;
  role: string;
}): string {
  return `${normalizeEmployer(params.employer)}:${normalizeRole(params.role)}`;
}
