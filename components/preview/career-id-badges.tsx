import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import styles from "./career-id-badges.module.css";

/**
 * Preview of the redesigned Career ID badges layout.
 *
 * Direction A (compact wallet grid) + a light version of C (tier-grouped
 * sections). Each badge is a smaller card with a colored left stripe
 * indicating tier. Verified-by-source sits on top, Verified in the
 * middle, On-file at the bottom. Empty groups don't render.
 *
 * Today this uses mock data so the preview works without the
 * production backend. When we promote this to the live Career ID page,
 * the data shape swaps to whatever `careerIdProfile.badges` (or the
 * raw evidence rows) carry.
 */

type Tier = "SOURCE_CONFIRMED" | "VERIFIED" | "ON_FILE";
type BadgeKind = "employment" | "education";

interface PreviewBadge {
  id: string;
  kind: BadgeKind;
  primary: string;
  secondary: string;
  tier: Tier;
  version: number;
  issuedAt?: string; // e.g. "Apr 2026"
}

const MOCK_BADGES: PreviewBadge[] = [
  {
    id: "badge_offer_letter_microsoft",
    kind: "employment",
    primary: "Microsoft",
    secondary: "Senior Software Engineer",
    tier: "SOURCE_CONFIRMED",
    version: 2,
    issuedAt: "Apr 2026",
  },
  {
    id: "badge_education_stanford_bs",
    kind: "education",
    primary: "Stanford University",
    secondary: "BS in Computer Science",
    tier: "VERIFIED",
    version: 1,
    issuedAt: "Feb 2026",
  },
  {
    id: "badge_cert_aws_saa",
    kind: "education",
    primary: "AWS",
    secondary: "Certified Solutions Architect — Associate",
    tier: "VERIFIED",
    version: 1,
    issuedAt: "Mar 2026",
  },
  {
    id: "badge_offer_letter_skywire",
    kind: "employment",
    primary: "Skywire Systems",
    secondary: "Software Engineer",
    tier: "ON_FILE",
    version: 1,
    issuedAt: "Apr 2026",
  },
  {
    id: "badge_offer_letter_acme",
    kind: "employment",
    primary: "Acme Corp",
    secondary: "Senior Engineer",
    tier: "ON_FILE",
    version: 1,
    issuedAt: "Mar 2026",
  },
  {
    id: "badge_transcript_stanford",
    kind: "education",
    primary: "Stanford University",
    secondary: "Academic transcript",
    tier: "ON_FILE",
    version: 1,
    issuedAt: "Feb 2026",
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

export function CareerIdBadgesPreview({ showEmpty = false }: { showEmpty?: boolean }) {
  const badges = showEmpty ? [] : MOCK_BADGES;

  const byTier = TIER_ORDER.map((tier) => ({
    tier,
    meta: TIER_META[tier],
    items: badges.filter((b) => b.tier === tier),
  }));

  const total = badges.length;

  return (
    <section className={styles.container}>
      <div className={styles.intro}>
        <h1 className={styles.heading}>Career ID Badges</h1>
        <p className={styles.lead}>
          {total > 0
            ? `${total} verified ${total === 1 ? "credential" : "credentials"} attached to your Career ID.`
            : "Credentials you earn will appear here."}
        </p>
      </div>

      {total === 0 ? (
        <EmptyState />
      ) : (
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
      )}

      <div className={styles.previewFooter}>
        <span className={styles.previewFooterNote}>
          Mock data · toggle <code>?empty=1</code> to preview the empty state
        </span>
      </div>
    </section>
  );
}

function BadgeCard({ badge }: { badge: PreviewBadge }) {
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

function EmptyState() {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <BadgeCheck size={22} strokeWidth={1.8} />
      </span>
      <h2 className={styles.emptyTitle}>No credentials yet</h2>
      <p className={styles.emptyBody}>
        Upload your first offer letter, HR verification, diploma, or transcript —
        we'll issue a verified badge you can share with recruiters.
      </p>
      <div className={styles.emptyActions}>
        <Link href="/agent-build" className={styles.emptyPrimary}>
          <Upload size={14} strokeWidth={2.2} />
          Upload your first credential
        </Link>
        <Link href="/preview/story" className={styles.emptySecondary}>
          <Sparkles size={14} strokeWidth={2.2} />
          See how it works
        </Link>
      </div>
    </div>
  );
}
