"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  FileText,
  GraduationCap,
  QrCode,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ScrollytellShell, type ScrollytellBeat } from "./scrollytell-shell";
import styles from "./product-scrollytell.module.css";

/**
 * Today's product narrative (6 beats + CTA):
 *
 *   1. mess     — scattered evidence
 *   2. claim    — say what's true
 *   3. score    — three tiers, one score
 *   4. wallet   — Career ID with credential lineages
 *   5. share    — permissioned recruiter view
 *   6. agent    — automated workflow
 *
 * See /preview/futureStory for where this is headed (Checkr integration
 * and one-click apply).
 */

const BEATS: ScrollytellBeat[] = [
  {
    id: "mess",
    eyebrow: "The problem",
    title: "Your career proof is scattered across a hundred files.",
    body: "Offer letters, W-2s, diplomas, transcripts, LinkedIn screenshots — in email threads, Drive folders, camera rolls. Every new application makes you reprove the same things.",
  },
  {
    id: "claim",
    eyebrow: "Start with truth",
    title: "You say what's true. We attach the evidence.",
    body: "Tell Career AI where you worked and what you studied. Each claim is tied to the actual document that backs it — no free-text resume, no unverified LinkedIn copy-paste.",
  },
  {
    id: "score",
    eyebrow: "Every credential gets a score",
    title: "Three tiers. One at-a-glance trust level.",
    body: "We read the document, cross-check the signer's domain, and run tamper checks. You land on one of three tiers — On file, Verified, or Verified by source — depending on how strong the signal is.",
  },
  {
    id: "wallet",
    eyebrow: "Your Career ID wallet",
    title: "Every verified credential stacks into one place you own.",
    body: "Credentials collect into your Career ID wallet. Same employer + role uploaded twice? It's a version bump on the same badge, not a duplicate. Portable across applications.",
  },
  {
    id: "share",
    eyebrow: "Share on your terms",
    title: "Recruiters see only the badges you choose.",
    body: "Toggle which credentials to include, generate a permissioned link. No scraped LinkedIn, no unsanctioned background pulls. Agent-to-agent, consent-first.",
  },
  {
    id: "agent",
    eyebrow: "Your agent handles the rest",
    title: "Applications, screening, follow-up — on autopilot.",
    body: "Your agent knows what's actually true about you. It finds aligned roles, applies against your verified profile, and keeps the grunt work off your plate.",
  },
];

export function ProductScrollytell() {
  return (
    <ScrollytellShell
      introTitle="From scattered paperwork to a Career ID you own."
      beats={BEATS}
      renderVisual={(beatId) => (
        <AnimatePresence mode="wait">
          {beatId === "mess" && <MessVisual key="mess" />}
          {beatId === "claim" && <ClaimVisual key="claim" />}
          {beatId === "score" && <ScoringVisual key="score" />}
          {beatId === "wallet" && <WalletVisual key="wallet" />}
          {beatId === "share" && <ShareVisual key="share" />}
          {beatId === "agent" && <AgentVisual key="agent" />}
        </AnimatePresence>
      )}
      cta={{
        eyebrow: "Ready when you are",
        title: "Start building your Career ID.",
        body: "Upload one offer letter or diploma. Watch it become a verified, portable badge in under a minute.",
        actions: [
          { href: "/agent-build", label: "Start Building My Career ID", primary: true },
          { href: "/preview/futureStory", label: "See what's coming next" },
        ],
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Visuals
// ---------------------------------------------------------------------------

const SCATTERED_DOCS = [
  { label: "Offer_Letter_Microsoft.pdf", x: -160, y: -110, r: -8 },
  { label: "2024_W2_Gauntlet.pdf", x: 140, y: -140, r: 6 },
  { label: "Diploma_Stanford.jpg", x: -190, y: 60, r: 4 },
  { label: "HR_Verification_Skywire.pdf", x: 170, y: 50, r: -10 },
  { label: "Transcript_Stanford.pdf", x: -60, y: 170, r: 12 },
  { label: "LinkedIn_screenshot_2024.png", x: 110, y: 180, r: -4 },
];

function MessVisual() {
  return (
    <motion.div
      key="mess"
      className={styles.messStage}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {SCATTERED_DOCS.map((doc, i) => (
        <motion.div
          key={doc.label}
          className={styles.docChip}
          initial={{ opacity: 0, x: doc.x * 2, y: doc.y * 2, rotate: doc.r * 2 }}
          animate={{
            opacity: 1,
            x: doc.x,
            y: [doc.y, doc.y - 8, doc.y],
            rotate: doc.r,
          }}
          transition={{
            opacity: { duration: 0.4, delay: i * 0.06 },
            x: { duration: 0.6, delay: i * 0.06, ease: "easeOut" },
            y: {
              duration: 3 + (i % 3) * 0.4,
              delay: 0.6 + i * 0.1,
              repeat: Infinity,
              ease: "easeInOut",
            },
            rotate: { duration: 0.6, delay: i * 0.06, ease: "easeOut" },
          }}
        >
          <FileText size={14} />
          <span>{doc.label}</span>
        </motion.div>
      ))}
      <div className={styles.messLabel}>...and 47 more in an email thread</div>
    </motion.div>
  );
}

function ClaimVisual() {
  const claimLines = [
    { label: "Role", value: "Senior Software Engineer" },
    { label: "Employer", value: "Microsoft" },
    { label: "Start", value: "January 2026" },
  ];

  return (
    <motion.div
      key="claim"
      className={styles.claimStage}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.5 }}
    >
      <div className={styles.claimCard}>
        <span className={styles.cardEyebrow}>You say…</span>
        {claimLines.map((line, i) => (
          <motion.div
            key={line.label}
            className={styles.claimRow}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 + i * 0.2 }}
          >
            <span className={styles.claimLabel}>{line.label}</span>
            <span className={styles.claimValue}>{line.value}</span>
          </motion.div>
        ))}
        <motion.div
          className={styles.claimAttachment}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.1 }}
        >
          <FileText size={14} />
          <span>Offer_Letter_Microsoft.pdf attached as evidence</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

const SCORE_TIERS: Array<{
  id: string;
  label: string;
  detail: string;
  stripeClass: string;
  highlighted?: boolean;
}> = [
  {
    id: "source",
    label: "Verified by source",
    detail: "Signer domain matches the claimed issuer",
    stripeClass: styles.stripeSource,
    highlighted: true,
  },
  {
    id: "verified",
    label: "Verified",
    detail: "Content + tampering checks passed",
    stripeClass: styles.stripeVerified,
  },
  {
    id: "onfile",
    label: "On file",
    detail: "Evidence submitted, no source signal",
    stripeClass: styles.stripeOnFile,
  },
];

function ScoringVisual() {
  return (
    <motion.div
      key="score"
      className={styles.scoreStage}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.scoreLadder}>
        {SCORE_TIERS.map((tier, i) => (
          <motion.div
            key={tier.id}
            className={`${styles.scoreTier} ${tier.highlighted ? styles.scoreTierHighlighted : ""}`}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.12 }}
          >
            <span className={`${styles.scoreStripe} ${tier.stripeClass}`} />
            <div className={styles.scoreTierBody}>
              <div className={styles.scoreTierHeader}>
                <ShieldCheck size={14} />
                <span className={styles.scoreTierLabel}>{tier.label}</span>
                {tier.highlighted ? (
                  <motion.span
                    className={styles.scoreTierPin}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.9, ease: "backOut" }}
                  >
                    Microsoft · Senior SWE
                  </motion.span>
                ) : null}
              </div>
              <p className={styles.scoreTierDetail}>{tier.detail}</p>
            </div>
          </motion.div>
        ))}
      </div>
      <motion.p
        className={styles.scoreCaption}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 1.2 }}
      >
        Your uploaded badge lands at the strongest tier its signals support.
      </motion.p>
    </motion.div>
  );
}

const WALLET_BADGES: Array<{ kind: "employment" | "education"; primary: string; secondary: string }> = [
  { kind: "employment", primary: "Microsoft", secondary: "Senior Software Engineer" },
  { kind: "education", primary: "Stanford", secondary: "BS Computer Science" },
  { kind: "education", primary: "AWS", secondary: "Certified Solutions Architect" },
  { kind: "employment", primary: "Skywire Systems", secondary: "Software Engineer" },
];

const KIND_ICON: Record<"employment" | "education", LucideIcon> = {
  employment: Building2,
  education: GraduationCap,
};

function WalletVisual() {
  return (
    <motion.div
      key="wallet"
      className={styles.walletStage}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.5 }}
    >
      <div className={styles.walletCard}>
        <div className={styles.walletHeader}>
          <div className={styles.walletAvatar}>FS</div>
          <div>
            <div className={styles.walletName}>Faheem Syed</div>
            <div className={styles.walletTaid}>TAID-000204 · Career ID wallet</div>
          </div>
          <BadgeCheck size={18} className={styles.walletVerifiedIcon} />
        </div>
        <div className={styles.walletBadges}>
          {WALLET_BADGES.map((badge, i) => {
            const Icon = KIND_ICON[badge.kind];
            return (
              <motion.div
                key={badge.primary + badge.secondary}
                className={styles.walletBadgeChip}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.08 }}
              >
                <Icon size={12} strokeWidth={2.2} />
                <div>
                  <div className={styles.walletBadgePrimary}>{badge.primary}</div>
                  <div className={styles.walletBadgeSecondary}>{badge.secondary}</div>
                </div>
                <span className={styles.walletBadgeVersion}>v{i === 0 ? 2 : 1}</span>
              </motion.div>
            );
          })}
        </div>
        <div className={styles.walletFooter}>
          <QrCode size={14} />
          <span>Portable · permissioned · yours</span>
        </div>
      </div>
    </motion.div>
  );
}

function ShareVisual() {
  return (
    <motion.div
      key="share"
      className={styles.shareStage}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.shareSplit}>
        <div className={styles.shareMyCard}>
          <div className={styles.shareCardHeader}>Your wallet</div>
          {[
            { label: "Microsoft · Senior SWE", on: true },
            { label: "Stanford · BS CS", on: true },
            { label: "Stanford · Transcript", on: false },
            { label: "AWS · SAA", on: true },
          ].map((row) => (
            <div key={row.label} className={styles.shareRow}>
              <span>{row.label}</span>
              <span
                className={`${styles.shareToggle} ${row.on ? styles.shareToggleOn : ""}`}
              >
                <span className={styles.shareToggleDot} />
              </span>
            </div>
          ))}
        </div>

        <div className={styles.shareArrow}>→</div>

        <div className={styles.shareRecruiterCard}>
          <div className={styles.shareCardHeader}>Recruiter sees</div>
          {[
            { label: "Microsoft · Senior SWE", tier: "Verified by source" },
            { label: "Stanford · BS CS", tier: "Verified" },
            { label: "AWS · SAA", tier: "Verified" },
          ].map((row) => (
            <motion.div
              key={row.label}
              className={styles.shareRecruiterRow}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <BadgeCheck size={14} />
              <div>
                <div>{row.label}</div>
                <div className={styles.shareRecruiterTier}>{row.tier}</div>
              </div>
            </motion.div>
          ))}
          <div className={styles.shareRecruiterHidden}>
            Transcript hidden (not shared by candidate)
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AgentVisual() {
  const steps = [
    "Searching roles that match your verified skills…",
    "Found 14 aligned openings. Shortlisting Microsoft, Stripe, Figma.",
    "Applying to Microsoft L63 SWE with your Career ID attached.",
    "Application submitted. Follow-up scheduled for day 3.",
  ];

  return (
    <motion.div
      key="agent"
      className={styles.agentStage}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.agentCard}>
        <div className={styles.agentHeader}>
          <Sparkles size={14} />
          <span>Career AI · Agent</span>
        </div>
        <div className={styles.agentStream}>
          {steps.map((step, i) => (
            <motion.div
              key={step}
              className={styles.agentStep}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.5 }}
            >
              <CheckCircle2 size={14} />
              <span>{step}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
