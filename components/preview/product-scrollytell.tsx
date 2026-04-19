"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import {
  BadgeCheck,
  CheckCircle2,
  FileText,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import styles from "./product-scrollytell.module.css";

/**
 * Scrollytelling landing narrative. Sticky visual column on the left tracks
 * the active beat; narrative scrolls past on the right. Desktop-only — the
 * parent page collapses this to a "come back on desktop" card on small
 * screens, so we don't carry a mobile layout here.
 *
 * Beats (see docs/.../landing-story.md for the copy spec):
 *   1. Mess        — scattered evidence
 *   2. Claim       — user states what's true, evidence attached
 *   3. Verify      — LLM scan + seal + badge reveal
 *   4. Lineage     — version pill ticks; sibling badges accrue
 *   5. ProfileCard — Career ID zoom-out
 *   6. Share       — permissioned recruiter view
 *   7. Agent       — automated workflow
 *   (CTA)          — final conversion card
 */

type BeatId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const BEATS: Array<{
  id: BeatId;
  eyebrow: string;
  title: string;
  body: string;
}> = [
  {
    id: 1,
    eyebrow: "The problem",
    title: "Your career history is trapped in a pile of PDFs.",
    body: "Offer letters, W-2s, diplomas, transcripts, LinkedIn screenshots — scattered across email threads, Drive folders, and photo rolls. Every new application makes you reprove the same things from scratch.",
  },
  {
    id: 2,
    eyebrow: "Start with truth",
    title: "You say what's true.",
    body: "Tell Career AI about your employment, education, and credentials. Every claim stays attached to the evidence behind it — no free-text resumes, no unverified LinkedIn copy-paste.",
  },
  {
    id: 3,
    eyebrow: "We check",
    title: "Paper becomes portable proof.",
    body: "We read the document, cross-check the signer's domain, and issue a verified credential. Employer ✓ role ✓ dates ✓ recipient ✓ — not a claim, a confirmation.",
  },
  {
    id: 4,
    eyebrow: "One credential, many proofs",
    title: "Each new document strengthens the same badge.",
    body: "Upload an HR verification letter, a W-2, a second offer letter for the same role — they all roll up into one credential lineage. Version ticks forward; your profile doesn't fill up with duplicates.",
  },
  {
    id: 5,
    eyebrow: "Your Career ID",
    title: "Your career, in one place you own.",
    body: "A portable identity with every verified credential attached. Portable across applications, permission-scoped, yours to share.",
  },
  {
    id: 6,
    eyebrow: "Share on your terms",
    title: "Recruiters see only what you chose to share.",
    body: "Toggle which badges to include, generate a permissioned link. No scraped LinkedIn, no unsanctioned background pulls. Agent-to-agent, consent-first.",
  },
  {
    id: 7,
    eyebrow: "Your agent does the rest",
    title: "Applications, screening, follow-up — on autopilot.",
    body: "Your agent knows what's actually true about you. It finds aligned roles, applies against your verified profile, and follows up so the grunt work disappears and the signal goes up.",
  },
];

export function ProductScrollytell() {
  const [activeBeat, setActiveBeat] = useState<BeatId>(1);

  return (
    <section className={styles.container}>
      <div className={styles.intro}>
        <p className={styles.introEyebrow}>Career AI, explained in a scroll</p>
        <h1 className={styles.introTitle}>
          From scattered paperwork to a Career ID you own.
        </h1>
        <p className={styles.introLead}>
          Keep scrolling. The left side shows the product doing its thing; the right side
          tells you why each step matters.
        </p>
      </div>

      <div className={styles.grid}>
        <div className={styles.stickyWrap}>
          <div className={styles.stickyInner}>
            <Visuals activeBeat={activeBeat} />
            <BeatTicker activeBeat={activeBeat} />
          </div>
        </div>

        <div className={styles.narrative}>
          {BEATS.map((beat) => (
            <BeatSection key={beat.id} beat={beat} onActivate={setActiveBeat} />
          ))}

          <CtaSection />
        </div>
      </div>
    </section>
  );
}

function BeatSection({
  beat,
  onActivate,
}: {
  beat: (typeof BEATS)[number];
  onActivate: (id: BeatId) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.5 });

  useEffect(() => {
    if (inView) onActivate(beat.id);
  }, [inView, beat.id, onActivate]);

  return (
    <section ref={ref} className={styles.beat}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0.25, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={styles.beatContent}
      >
        <span className={styles.eyebrow}>{beat.eyebrow}</span>
        <h2 className={styles.beatTitle}>{beat.title}</h2>
        <p className={styles.beatBody}>{beat.body}</p>
      </motion.div>
    </section>
  );
}

function BeatTicker({ activeBeat }: { activeBeat: BeatId }) {
  return (
    <div className={styles.ticker}>
      {BEATS.map((beat) => (
        <div
          key={beat.id}
          className={`${styles.tickerDot} ${beat.id === activeBeat ? styles.tickerDotActive : ""}`}
        />
      ))}
    </div>
  );
}

function CtaSection() {
  return (
    <section className={styles.ctaSection}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.4, once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={styles.ctaCard}
      >
        <span className={styles.eyebrow}>Ready when you are</span>
        <h2 className={styles.ctaTitle}>Start building your Career ID.</h2>
        <p className={styles.ctaBody}>
          Upload one offer letter or diploma. Watch it become a verified, portable badge in
          under a minute.
        </p>
        <div className={styles.ctaActions}>
          <Link href="/agent-build" className={styles.ctaPrimary}>
            Start Building My Career ID
          </Link>
          <Link href="/" className={styles.ctaSecondary}>
            Back to home
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sticky visuals
// ---------------------------------------------------------------------------

function Visuals({ activeBeat }: { activeBeat: BeatId }) {
  return (
    <div className={styles.stage}>
      <AnimatePresence mode="wait">
        {activeBeat === 1 && <MessVisual key="mess" />}
        {activeBeat === 2 && <ClaimVisual key="claim" />}
        {activeBeat === 3 && <VerifyVisual key="verify" />}
        {activeBeat === 4 && <LineageVisual key="lineage" />}
        {activeBeat === 5 && <ProfileVisual key="profile" />}
        {activeBeat === 6 && <ShareVisual key="share" />}
        {activeBeat === 7 && <AgentVisual key="agent" />}
      </AnimatePresence>
    </div>
  );
}

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

function VerifyVisual() {
  const fields = [
    { label: "Is this an offer letter?", delay: 0.4 },
    { label: "Employer: Microsoft", delay: 0.9 },
    { label: "Role: Senior Software Engineer", delay: 1.4 },
    { label: "Start: Jan 15, 2026", delay: 1.9 },
    { label: "Recipient: Faheem Syed", delay: 2.4 },
  ];

  return (
    <motion.div
      key="verify"
      className={styles.verifyStage}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.verifyCard}>
        <div className={styles.verifyCardHeader}>
          <FileText size={14} />
          <span>Offer_Letter_Microsoft.pdf</span>
        </div>
        <motion.div
          className={styles.scanLine}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: 260, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.6, delay: 0.2, ease: "easeInOut" }}
        />
        <div className={styles.verifyFields}>
          {fields.map((field) => (
            <motion.div
              key={field.label}
              className={styles.verifyField}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: field.delay }}
            >
              <motion.span
                className={styles.verifyCheck}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: field.delay + 0.1 }}
              >
                <CheckCircle2 size={14} />
              </motion.span>
              <span>{field.label}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        className={styles.sealBadge}
        initial={{ scale: 0, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.5, delay: 3, ease: "backOut" }}
      >
        <ShieldCheck size={18} />
        <div className={styles.sealBadgeCopy}>
          <span className={styles.sealBadgeLabel}>Verified by source</span>
          <span className={styles.sealBadgeSubtle}>
            Microsoft · Senior Software Engineer
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function LineageVisual() {
  return (
    <motion.div
      key="lineage"
      className={styles.lineageStage}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.lineageRow}>
        <div className={`${styles.lineageBadge} ${styles.lineageBadgePrimary}`}>
          <ShieldCheck size={16} />
          <div>
            <div className={styles.lineageBadgeTitle}>
              Microsoft · Senior Software Engineer
            </div>
            <div className={styles.lineageBadgeSubtle}>
              Offer letter + HR verification
            </div>
          </div>
          <motion.span
            className={styles.versionPill}
            key="v-pill"
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            v2
          </motion.span>
        </div>
      </div>

      <div className={styles.lineageSupport}>
        {[
          { label: "offer letter", emphasis: true },
          { label: "HR verification letter", emphasis: true },
          { label: "W-2" },
          { label: "pay stub" },
        ].map((doc, i) => (
          <motion.span
            key={doc.label}
            className={`${styles.lineageDoc} ${doc.emphasis ? styles.lineageDocActive : ""}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + i * 0.08 }}
          >
            {doc.label}
          </motion.span>
        ))}
      </div>

      <div className={styles.lineageRow}>
        <motion.div
          className={styles.lineageBadge}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 1.0 }}
        >
          <ShieldCheck size={16} />
          <div>
            <div className={styles.lineageBadgeTitle}>Stanford · BS Computer Science</div>
            <div className={styles.lineageBadgeSubtle}>Diploma</div>
          </div>
          <span className={styles.versionPill}>v1</span>
        </motion.div>
        <motion.div
          className={styles.lineageBadge}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 1.3 }}
        >
          <ShieldCheck size={16} />
          <div>
            <div className={styles.lineageBadgeTitle}>Stanford · Transcript</div>
            <div className={styles.lineageBadgeSubtle}>Academic record</div>
          </div>
          <span className={styles.versionPill}>v1</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

function ProfileVisual() {
  const badges = [
    "Microsoft · Senior Software Engineer",
    "Stanford · BS Computer Science",
    "Stanford · Transcript",
    "AWS · Certified Solutions Architect",
  ];
  return (
    <motion.div
      key="profile"
      className={styles.profileStage}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.5 }}
    >
      <div className={styles.profileCard}>
        <div className={styles.profileHeader}>
          <div className={styles.profileAvatar}>FS</div>
          <div>
            <div className={styles.profileName}>Faheem Syed</div>
            <div className={styles.profileTaid}>TAID-000204 · Career ID</div>
          </div>
          <BadgeCheck size={18} className={styles.profileVerifiedIcon} />
        </div>
        <div className={styles.profileBadges}>
          {badges.map((label, i) => (
            <motion.div
              key={label}
              className={styles.profileBadgeChip}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.08 }}
            >
              <ShieldCheck size={12} />
              <span>{label}</span>
            </motion.div>
          ))}
        </div>
        <div className={styles.profileFooter}>
          <QrCode size={14} />
          <span>Share as permissioned link</span>
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
          <div className={styles.shareCardHeader}>Your profile</div>
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
            { label: "Stanford · BS CS", tier: "Evidence submitted" },
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
