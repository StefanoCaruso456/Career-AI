"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  GraduationCap,
  Link2,
  Send,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ScrollytellShell, type ScrollytellBeat } from "./scrollytell-shell";
import styles from "./product-scrollytell.module.css";

/**
 * Forward-looking roadmap narrative. Same shell as /preview/story; the
 * story diverges at the "you've built a wallet" moment and shows what's
 * next:
 *
 *   1. wallet   — you've built a Career ID (recap)
 *   2. checkr   — partner-pulled verifications, no uploads
 *   3. tier     — institution-verified becomes the new top score
 *   4. apply    — one-click apply with real, wallet-backed answers
 *   (CTA)       — help shape it
 */

const BEATS: ScrollytellBeat[] = [
  {
    id: "wallet",
    eyebrow: "Where we are today",
    title: "You've built a verified Career ID wallet.",
    body: "Offer letters, diplomas, transcripts — all uploaded, scored, and stacked. Portable and permissioned. Here's where we're taking it next.",
  },
  {
    id: "checkr",
    eyebrow: "Next: automated verification",
    title: "Partner integrations pull your records directly.",
    body: "Connect Checkr once. Your employment history comes straight from the employer's HRIS, your education straight from the registrar, your certifications straight from the issuer. No uploads, no scanning, no photo of a diploma under your laptop's webcam.",
  },
  {
    id: "tier",
    eyebrow: "A new top tier",
    title: "Institution-verified outranks everything you can upload.",
    body: "Signer-domain matching was the ceiling. When Checkr pulls your record directly from an authoritative institutional source, the signal is fundamentally stronger — we score that substantially higher. Verified by source stays valid; Institution-verified becomes the new top.",
  },
  {
    id: "apply",
    eyebrow: "One-click apply, real answers",
    title: "An agent that already knows what's true about you.",
    body: "Your agent has your verified wallet. It scans the job board, picks aligned roles, and auto-applies — but when the employer asks 'why this role' or 'describe a time you led a project,' the agent answers from your actual Career ID: the Microsoft role, the Stanford degree, the outcomes you logged. Not generic LLM fluff. Real answers grounded in what you've actually verified.",
  },
];

export function FutureStoryScrollytell() {
  return (
    <ScrollytellShell
      introTitle="Your Career ID is just the start. Here's where we take it next."
      beats={BEATS}
      renderVisual={(beatId) => (
        <AnimatePresence mode="wait">
          {beatId === "wallet" && <WalletRecapVisual key="wallet" />}
          {beatId === "checkr" && <CheckrVisual key="checkr" />}
          {beatId === "tier" && <InstitutionTierVisual key="tier" />}
          {beatId === "apply" && <OneClickApplyVisual key="apply" />}
        </AnimatePresence>
      )}
      cta={{
        eyebrow: "Coming soon",
        title: "Shape the roadmap with us.",
        body: "Early-access partners can pilot Checkr integration and one-click apply before general release.",
        actions: [
          { href: "/agent-build", label: "Start with today's Career ID", primary: true },
          { href: "/preview/story", label: "Back to the current story" },
        ],
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Beat 1 — Wallet recap (reuses the story's wallet visual look)
// ---------------------------------------------------------------------------

const WALLET_BADGES: Array<{
  kind: "employment" | "education";
  primary: string;
  secondary: string;
}> = [
  { kind: "employment", primary: "Microsoft", secondary: "Senior Software Engineer" },
  { kind: "education", primary: "Stanford", secondary: "BS Computer Science" },
  { kind: "education", primary: "AWS", secondary: "Certified Solutions Architect" },
  { kind: "employment", primary: "Skywire Systems", secondary: "Software Engineer" },
];

const KIND_ICON: Record<"employment" | "education", LucideIcon> = {
  employment: Building2,
  education: GraduationCap,
};

function WalletRecapVisual() {
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
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Beat 2 — Checkr integration
// ---------------------------------------------------------------------------

function CheckrVisual() {
  return (
    <motion.div
      key="checkr"
      className={styles.checkrStage}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.checkrFlow}>
        <div className={styles.checkrPartner}>
          <div className={styles.checkrPartnerHeader}>Checkr · connected</div>
          <motion.div
            className={styles.checkrPartnerRow}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Link2 size={12} strokeWidth={2.2} />
            <span>Pulling HRIS employment records…</span>
          </motion.div>
          <motion.div
            className={styles.checkrPartnerRow}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            <Link2 size={12} strokeWidth={2.2} />
            <span>Pulling registrar education records…</span>
          </motion.div>
          <motion.div
            className={styles.checkrPartnerRow}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.8 }}
          >
            <Link2 size={12} strokeWidth={2.2} />
            <span>Pulling issuer-verified certifications…</span>
          </motion.div>
        </div>

        <div className={styles.checkrArrow}>→</div>

        <div className={styles.checkrWallet}>
          <div className={styles.checkrWalletHeader}>Career ID wallet</div>
          {[
            { primary: "Microsoft", secondary: "Senior SWE", delay: 0.6 },
            { primary: "Stanford", secondary: "BS CS", delay: 0.95 },
            { primary: "AWS", secondary: "SAA", delay: 1.25 },
          ].map((badge) => (
            <motion.div
              key={badge.primary}
              className={styles.checkrWalletRow}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: badge.delay }}
            >
              <BadgeCheck size={13} strokeWidth={2.2} />
              <span>
                {badge.primary} · {badge.secondary}
              </span>
              <span className={styles.checkrWalletNewPill}>NEW</span>
            </motion.div>
          ))}
        </div>
      </div>

      <p className={styles.checkrCaption}>No uploads. No screenshots. Straight from the source.</p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Beat 3 — Institution-verified tier (four-tier ladder)
// ---------------------------------------------------------------------------

const FUTURE_TIERS: Array<{
  id: string;
  label: string;
  detail: string;
  stripeClass: string;
  cardClass?: string;
  pinClass?: string;
  pin?: string;
  highlighted?: boolean;
}> = [
  {
    id: "institution",
    label: "Institution-verified",
    detail: "Pulled directly from HRIS / registrar / issuer",
    stripeClass: styles.stripeInstitution,
    cardClass: styles.scoreTierInstitution,
    pinClass: styles.scoreTierPinInstitution,
    pin: "New top tier",
    highlighted: true,
  },
  {
    id: "source",
    label: "Verified by source",
    detail: "Signer domain matches the claimed issuer",
    stripeClass: styles.stripeSource,
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

function InstitutionTierVisual() {
  return (
    <motion.div
      key="tier"
      className={styles.scoreStage}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.scoreLadder}>
        {FUTURE_TIERS.map((tier, i) => (
          <motion.div
            key={tier.id}
            className={`${styles.scoreTier} ${tier.cardClass ?? ""} ${
              tier.highlighted ? styles.scoreTierHighlighted : ""
            }`}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.1 }}
          >
            <span className={`${styles.scoreStripe} ${tier.stripeClass}`} />
            <div className={styles.scoreTierBody}>
              <div className={styles.scoreTierHeader}>
                <ShieldCheck size={14} />
                <span className={styles.scoreTierLabel}>{tier.label}</span>
                {tier.pin ? (
                  <motion.span
                    className={`${styles.scoreTierPin} ${tier.pinClass ?? ""}`}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.8, ease: "backOut" }}
                  >
                    {tier.pin}
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
        Institution-verified is scored substantially higher — it's a signal no
        user-submitted document can produce.
      </motion.p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Beat 4 — One-click apply
// ---------------------------------------------------------------------------

function OneClickApplyVisual() {
  const questions = [
    {
      label: "Why this role?",
      answer: (
        <>
          I'm currently a <em>Senior Software Engineer at Microsoft</em> where
          I've led distributed-systems work. The L63 scope at your team lines up
          with the projects I'd want to scale next.
        </>
      ),
      delay: 0.5,
    },
    {
      label: "Describe a time you shipped under constraint",
      answer: (
        <>
          At Microsoft I owned a <em>real-time inference path</em> that had to
          cut p99 latency by 40% in one quarter — I'll link the postmortem from
          my Career ID.
        </>
      ),
      delay: 1.2,
    },
  ];

  return (
    <motion.div
      key="apply"
      className={styles.applyStage}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.applyCard}>
        <div className={styles.applyJobHeader}>
          <Sparkles size={14} />
          <span>
            Applying to <strong>Microsoft · L63 SWE</strong>
          </span>
        </div>
        <div className={styles.applyAnswers}>
          {questions.map((q) => (
            <motion.div
              key={q.label}
              className={styles.applyQuestion}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: q.delay }}
            >
              <span className={styles.applyQuestionLabel}>{q.label}</span>
              <span className={styles.applyQuestionAnswer}>{q.answer}</span>
            </motion.div>
          ))}
        </div>
        <motion.div
          className={styles.applyFooter}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 2.2 }}
        >
          <Send size={13} strokeWidth={2.2} />
          <CheckCircle2 size={13} strokeWidth={2.2} />
          <span>Submitted with verified Career ID · grounded answers, not LLM fluff.</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
