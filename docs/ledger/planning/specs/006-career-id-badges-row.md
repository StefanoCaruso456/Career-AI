# Spec 006 — Career ID badges row (plain-JSON, no VC)

**Status:** planned, not started.
**Supersedes:** nothing.
**Superseded by:** spec 005's "Career-AI badge UI + verify button" line-item once W3C VCs exist. This spec is the MVP that ships now and upgrades later.

## Context

Stefano's Career ID work populates `profile.badges` on the API response ([packages/career-id-domain/src/service.ts:930-940](../../../../packages/career-id-domain/src/service.ts#L930-L940)) whenever the user has a verified government-ID evidence record. The monorepo consolidation added a second populator: `verificationStatus = "VERIFIED"` on a `career_builder_evidence` row pushes an "Offer letter verified" entry into the same array ([packages/career-builder-domain/src/service.ts:418-431](../../../../packages/career-builder-domain/src/service.ts#L418-L431)).

Problem: **no UI component actually reads `profile.badges`.** The "Government ID verified" text a user currently sees comes from the document-backed card's own status pill ([components/agent-builder-workspace.tsx:441](../../../../components/agent-builder-workspace.tsx#L441)) — a government-ID-specific code path hardcoded for the Persona flow. The offer-letter pill label (`e940b26`) hangs on the same per-card pattern. Both work, but neither generalizes — every new "thing that can be verified" would need its own hardcoded status-label branch.

A dedicated **badges row** on the Career ID page — a horizontal strip of chips showing every earned badge — collapses this to one render path and gives Career ID a visible "trophy case" feel. Still plain JSON. No crypto. No VC wrapping. When the W3C VC work lands (spec 005), each chip gains a "Verify" button that calls `verifyCredential()` client-side; the chip itself stays.

## Scope

Build a read-only `<BadgesRow>` component that renders `careerIdProfile.badges` as a horizontal row of chips at the top of the Career ID tab, above the phase-progress UI.

**In scope:**
- Chip component: icon + label + phase-colored border.
- Row layout: horizontal scrolling on overflow, not stacking.
- Empty state: row hidden entirely when `badges.length === 0` (don't show an empty container).
- Visual mapping of `CareerIdBadge.phase` → color class (self_reported = gray, document_backed = blue, signature_backed = purple, institution_verified = green, relationship_backed = amber).
- Accessibility: each chip `role="img"` with `aria-label` describing the badge.

**Out of scope:**
- VC signing, DID resolution, or `verifyCredential()` — that's spec 005.
- Tooltips on hover explaining what a badge means — future enhancement.
- Revocation or expiry display — badges aren't time-bound yet.
- Click-through to evidence detail — nice-to-have, not required.
- "Copy proof link" / "Share badge" actions — wallet feature, separate.
- Changing the existing per-card status pill behavior. The pill stays as-is; the row is additive.

## Design

### Data — already in place

No new API fields. The consumer reads `snapshot.careerIdProfile.badges` which is already populated for both sources:

| Badge                     | Populated by                                                      | Trigger                                                                 |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Government ID verified`  | [career-id-domain/service.ts:930-940](../../../../packages/career-id-domain/src/service.ts#L930-L940) | `career_id_evidence.status === "verified"` (Persona verification lands) |
| `Offer letter verified`   | [career-builder-domain/service.ts:418-431](../../../../packages/career-builder-domain/src/service.ts#L418-L431) (via `extraBadges`) | `career_builder_evidence.verification_status === "VERIFIED"` (api-gateway returns VERIFIED on offer-letter save) |

Badge shape:

```ts
{ id: string; label: string; phase: TrustLayer; status: "verified" }
```

### Component

New file: `components/career-id/badges-row.tsx` (client component; pure presentational).

```tsx
"use client";

import { ShieldCheck } from "lucide-react";
import type { CareerIdBadge } from "@/packages/contracts/src";
import styles from "./badges-row.module.css";

type Props = { badges: CareerIdBadge[] };

export function BadgesRow({ badges }: Props) {
  if (badges.length === 0) return null;
  return (
    <div role="list" aria-label="Earned verification badges" className={styles.row}>
      {badges.map((badge) => (
        <span
          key={badge.id}
          role="listitem"
          aria-label={`${badge.label} badge, phase ${badge.phase}`}
          className={`${styles.chip} ${styles[`phase_${badge.phase}`]}`}
        >
          <ShieldCheck aria-hidden="true" size={14} strokeWidth={2} />
          <span className={styles.label}>{badge.label}</span>
        </span>
      ))}
    </div>
  );
}
```

Matching `components/career-id/badges-row.module.css` — reuse existing design tokens in `styles/tokens.css` (or wherever the project keeps them) for colors so the chips match the rest of the surface.

### Placement

Render the row at the top of the Career ID modal's content area, above the phase list. Find the insertion point in `components/agent-builder-workspace.tsx` where the phases list is rendered and add `<BadgesRow badges={snapshot.careerIdProfile.badges} />` immediately before it.

### Files changed

- **New**: `components/career-id/badges-row.tsx`
- **New**: `components/career-id/badges-row.module.css`
- **Edit**: `components/agent-builder-workspace.tsx` — import and render `<BadgesRow>` above the phase list.

Zero server changes. Zero DB changes. Zero contract changes.

## Verification

End-to-end happy path:

1. Sign in as a fresh user. Career ID tab shows no badges row (empty-state → hidden).
2. Complete Persona government-ID verification. Refresh Career ID tab. Row appears with one "Government ID verified" chip (blue `document_backed` styling).
3. Upload an offer letter that verifies (correct employer/role/start-date matching the PDF content). Without reload — the save route already rebuilds the snapshot on VERIFIED — the row updates to two chips.
4. Inspect DOM: each chip has `role="listitem"` and an `aria-label` with the badge name and phase.
5. Narrow the viewport; chips overflow horizontally (scroll), don't wrap to a second row.

Negative cases:

- Fresh user with no verifications: `<BadgesRow>` renders `null`. No empty container in the DOM.
- Offer letter with verdict PARTIAL: no chip added (only VERIFIED qualifies by the badge-derivation logic in both services).
- A new badge type added server-side that uses an unrecognized `phase` value: chip still renders, but no phase color class matches, so it falls back to the base chip styling. Non-blocking.

## Later: VC upgrade path

When spec 005's wallet-service + issuer-service ship:

- `CareerIdBadge` grows optional fields: `credentialId: string` (points at a VC in the wallet) and `issuerDid: string`.
- The chip becomes clickable. Click opens a small drawer showing the VC's `credentialSubject` and a "Verify" button that calls `verifyCredential()` against the issuer's DID document.
- Nothing about the chip's position or styling changes. The row stays where it is; the content behind each chip gets richer.

No refactor at that point — the `profile.badges` array is already the component's input. Just add optional fields, wire click handler, done.
