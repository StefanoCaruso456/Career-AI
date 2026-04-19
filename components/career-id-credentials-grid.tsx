import {
  Building2,
  GraduationCap,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { CareerEvidenceRecord } from "@/packages/contracts/src";
import styles from "./career-id-credentials-grid.module.css";

/**
 * Compact wallet-grid renderer for the Career ID's credential badges.
 * Replaces the older stacked-card layout. Each badge is small, grouped
 * by tier, with a 4px colored left stripe for at-a-glance status.
 *
 * Does NOT touch the government-ID ("identity") badge — that's rendered
 * separately by the parent (agent-builder-workspace) and keeps its
 * existing treatment. This component only handles the claim-backed
 * credentials that come out of the verify pipeline (offer-letter,
 * employment-verification, education, transcript).
 *
 * Input is the full snapshot.evidence array; the component filters for
 * verified / partial rows internally and skips anything else. SAMPLE
 * badges are appended unconditionally so the page shows a healthy
 * spread during the demo phase — they can be removed by emptying
 * SAMPLE_BADGES.
 */

type Tier = "SOURCE_CONFIRMED" | "VERIFIED" | "ON_FILE";
type BadgeKind = "employment" | "education";

interface BadgeItem {
  id: string;
  kind: BadgeKind;
  primary: string;
  secondary: string;
  tier: Tier;
  version: number;
  issuedAt?: string;
}

const SAMPLE_BADGES: BadgeItem[] = [
  {
    id: "sample_badge_microsoft_senior_swe",
    kind: "employment",
    primary: "Microsoft",
    secondary: "Senior Software Engineer",
    tier: "SOURCE_CONFIRMED",
    version: 2,
    issuedAt: "Apr 2026",
  },
  {
    id: "sample_badge_stanford_bs_cs",
    kind: "education",
    primary: "Stanford University",
    secondary: "BS in Computer Science",
    tier: "VERIFIED",
    version: 1,
    issuedAt: "Feb 2026",
  },
  {
    id: "sample_badge_aws_saa",
    kind: "education",
    primary: "AWS",
    secondary: "Certified Solutions Architect — Associate",
    tier: "VERIFIED",
    version: 1,
    issuedAt: "Mar 2026",
  },
  {
    id: "sample_badge_skywire_swe",
    kind: "employment",
    primary: "Skywire Systems",
    secondary: "Software Engineer",
    tier: "ON_FILE",
    version: 1,
    issuedAt: "Apr 2026",
  },
  {
    id: "sample_badge_acme_senior_engineer",
    kind: "employment",
    primary: "Acme Corp",
    secondary: "Senior Engineer",
    tier: "ON_FILE",
    version: 1,
    issuedAt: "Mar 2026",
  },
];

const TIER_META: Record<
  Tier,
  {
    label: string;
    groupLabel: string;
    groupLead: string;
    stripeClass: string;
  }
> = {
  SOURCE_CONFIRMED: {
    label: "Verified by source",
    groupLabel: "Verified by source",
    groupLead: "Signer domain matched the claimed issuer.",
    stripeClass: styles.stripeSource,
  },
  VERIFIED: {
    label: "Verified",
    groupLabel: "Verified",
    groupLead: "Evidence reviewed and accepted; trusted-source signal partial.",
    stripeClass: styles.stripeVerified,
  },
  ON_FILE: {
    label: "On file",
    groupLabel: "On file",
    groupLead: "Evidence submitted; no out-of-band source signal.",
    stripeClass: styles.stripeOnFile,
  },
};

const KIND_ICON: Record<BadgeKind, LucideIcon> = {
  employment: Building2,
  education: GraduationCap,
};

const TIER_ORDER: Tier[] = ["SOURCE_CONFIRMED", "VERIFIED", "ON_FILE"];

/**
 * Template → badge-kind mapping. Used to pick an icon and (for records
 * that have no explicit `primary` / `secondary` beyond the evidence
 * row's `sourceOrIssuer` / `role`) a label fallback.
 */
const TEMPLATE_KIND: Partial<Record<string, BadgeKind>> = {
  "offer-letters": "employment",
  "employment-history-reports": "employment",
  "diplomas-degrees": "education",
  transcripts: "education",
};

function evidenceToBadge(record: CareerEvidenceRecord): BadgeItem | null {
  const kind = TEMPLATE_KIND[record.templateId];
  if (!kind) return null;
  if (
    record.verificationStatus !== "VERIFIED" &&
    record.verificationStatus !== "PARTIAL"
  ) {
    return null;
  }
  const tier: Tier =
    record.verificationStatus === "VERIFIED" ? "VERIFIED" : "ON_FILE";
  const primary = record.sourceOrIssuer || "Unknown issuer";
  const secondary = record.role || fallbackSecondary(record.templateId);
  return {
    id: record.id,
    kind,
    primary,
    secondary,
    tier,
    version: 1,
    issuedAt: record.issuedOn ? formatIssueDate(record.issuedOn) : undefined,
  };
}

function fallbackSecondary(templateId: string): string {
  if (templateId === "offer-letters") return "Offer letter";
  if (templateId === "employment-history-reports") return "Employment verification";
  if (templateId === "diplomas-degrees") return "Degree";
  if (templateId === "transcripts") return "Academic transcript";
  return "Credential";
}

function formatIssueDate(iso: string): string {
  const [y, m] = iso.split("-");
  const monthIndex = Number(m) - 1;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthName = months[monthIndex] ?? "";
  return monthName ? `${monthName} ${y}` : y;
}

export function CareerIdCredentialsGrid({
  evidence,
}: {
  evidence: CareerEvidenceRecord[];
}) {
  const realBadges = evidence
    .map(evidenceToBadge)
    .filter((b): b is BadgeItem => b !== null);

  const badges = [...realBadges, ...SAMPLE_BADGES];

  const byTier = TIER_ORDER.map((tier) => ({
    tier,
    meta: TIER_META[tier],
    items: badges.filter((b) => b.tier === tier),
  }));

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className={styles.groups}>
      {byTier.map((group) =>
        group.items.length === 0 ? null : (
          <div key={group.tier} className={styles.group}>
            <div className={styles.groupHeader}>
              <span className={`${styles.groupDot} ${group.meta.stripeClass}`} />
              <span className={styles.groupLabel}>{group.meta.groupLabel}</span>
              <span className={styles.groupCount}>{group.items.length}</span>
              <span className={styles.groupLead}>{group.meta.groupLead}</span>
            </div>

            <div className={styles.grid}>
              {group.items.map((badge) => (
                <BadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function BadgeCard({ badge }: { badge: BadgeItem }) {
  const meta = TIER_META[badge.tier];
  const Icon = KIND_ICON[badge.kind];
  return (
    <article className={styles.card} data-tier={badge.tier}>
      <span className={`${styles.stripe} ${meta.stripeClass}`} />
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon size={14} strokeWidth={2} />
          </span>
          <h3 className={styles.primary}>{badge.primary}</h3>
        </div>
        <p className={styles.secondary}>{badge.secondary}</p>
        <div className={styles.cardFooter}>
          <span className={styles.tierLabel}>
            <ShieldCheck size={12} strokeWidth={2.2} />
            {meta.label}
          </span>
          {badge.version > 1 ? (
            <span className={styles.versionPill}>v{badge.version}</span>
          ) : null}
          {badge.issuedAt ? (
            <span className={styles.issuedAt}>{badge.issuedAt}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
