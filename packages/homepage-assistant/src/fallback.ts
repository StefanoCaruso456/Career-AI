type HomepageAssistantAttachment = {
  mimeType: string;
  name: string;
  size: number;
};

function buildStructuredReply(args: {
  attachments?: HomepageAssistantAttachment[];
  bullets: string[];
  explanation: string;
  nextSteps: string;
}) {
  const sections = [
    args.explanation,
    "",
    ...args.bullets.map((bullet) => `- ${bullet}`),
    "",
    `Next steps: ${args.nextSteps}`,
  ];

  return `${sections.join("\n")}${buildAttachmentSuffix(args.attachments ?? [])}`;
}

const homepageFallbackReplies = [
  {
    matches: [
      "what does the agent actually do",
      "what does the agent do",
      "what does this actually do",
      "what does this do",
    ],
    explanation:
      "Career AI's agent turns your Career ID into a recruiter-ready trust layer so your background is easier to review and understand.",
    bullets: [
      "It uses the identity, work history, education, and supporting proof attached to your Career ID.",
      "That helps recruiters see what is verified, what still needs review, and where to ask better follow-up questions.",
      "The goal is to move beyond a resume-only workflow and make trust easier to establish.",
    ],
    nextSteps:
      "Open or build your Career ID, then add the strongest proof for your identity, experience, and education so the agent has better material to work from.",
  },
  {
    matches: ["resume builder", "different from a resume"],
    explanation:
      "A resume builder helps you format a story, while Career AI is designed to help you support that story with trust signals and verification context.",
    bullets: [
      "A resume is usually a static summary, but Career AI is centered on a portable Career ID.",
      "The platform ties identity, employment, education, and supporting proof to the candidate profile over time.",
      "That gives employers a clearer way to review what is asserted versus what is backed by evidence.",
    ],
    nextSteps:
      "Compare your current resume to your Career ID and fill in any missing proof that would help a recruiter trust your strongest claims faster.",
  },
  {
    matches: [
      "get hired faster",
      "why should i do this",
      "why do this",
      "why does this matter",
    ],
    explanation:
      "Career AI can help you get hired faster by reducing recruiter doubt and making your credibility easier to review.",
    bullets: [
      "Your Career ID brings identity, work history, education, and supporting proof into one place.",
      "That can reduce back-and-forth because employers do not have to piece together the same story across scattered documents.",
      "When trust is established faster, qualified candidates have a better chance of moving forward sooner.",
    ],
    nextSteps:
      "Focus first on the claims most relevant to your target role and add proof that makes those claims easier for a recruiter to trust at a glance.",
  },
  {
    matches: [
      "secure career identity platform",
      "why is this secure",
      "why is this a secure career identity platform",
    ],
    explanation:
      "Career AI is positioned as a secure career identity platform because it is built around permission-based sharing, attached proof, and clearer verification context.",
    bullets: [
      "Candidates build a portable Career ID instead of re-entering the same claims everywhere.",
      "Identity, work history, education, and supporting evidence stay connected so reviewers can see what is verified and what is still self-reported.",
      "Sharing is intended to be explicit and controlled, which is safer than passing around disconnected documents without context.",
    ],
    nextSteps:
      "Review which parts of your profile are already supported by proof, then decide what information you want to share by default versus only when an employer requests it.",
  },
];

function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function buildAttachmentSuffix(attachments: HomepageAssistantAttachment[]) {
  if (attachments.length === 0) {
    return "";
  }

  const attachmentList = attachments
    .map((attachment) => `${attachment.name} (${formatAttachmentSize(attachment.size)})`)
    .join(", ");

  return `\n\nAttached files: ${attachmentList}.`;
}

export function getMatchedHomepageReply(
  message: string,
  attachments: HomepageAssistantAttachment[] = [],
) {
  const normalizedMessage = message.trim().toLowerCase();
  const matchedFallback = homepageFallbackReplies.find(({ matches }) =>
    matches.some((match) => normalizedMessage.includes(match)),
  );

  if (!matchedFallback) {
    return null;
  }

  return buildStructuredReply({
    attachments,
    bullets: matchedFallback.bullets,
    explanation: matchedFallback.explanation,
    nextSteps: matchedFallback.nextSteps,
  });
}

export function getFallbackHomepageReply(
  message: string,
  attachments: HomepageAssistantAttachment[] = [],
) {
  const normalizedMessage = message.trim().toLowerCase();
  const matchedReply = getMatchedHomepageReply(message, attachments);

  if (matchedReply) {
    return matchedReply;
  }

  if (attachments.length > 0 && !normalizedMessage) {
    return buildStructuredReply({
      attachments,
      bullets: [
        "I can acknowledge the file names and metadata you shared here.",
        "I should not claim to have parsed the contents unless you provide the text or ask me to compare specific details.",
        "A focused question will let me give you a more useful answer.",
      ],
      explanation:
        "I can see your attached files, but I need a specific question before I can help in a grounded way.",
      nextSteps:
        "Tell me what you want reviewed, compared, or summarized and I will respond with a clear explanation and practical guidance.",
    });
  }

  return buildStructuredReply({
    attachments,
    bullets: [
      "It centers candidate identity, work history, education, and supporting proof in one portable profile.",
      "That makes it easier for employers to understand what is verified and where more confirmation may still be needed.",
      "The product is meant to reduce uncertainty and make trust easier to build during hiring.",
    ],
    explanation:
      "Career AI is a career identity platform for job seekers that aims to turn claims into evidence-backed credibility.",
    nextSteps:
      "Ask about hiring speed, recruiter trust, secure sharing, or Career ID workflows and I can break down the part that matters most to you.",
  });
}
