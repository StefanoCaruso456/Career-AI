type HomepageAssistantAttachment = {
  mimeType: string;
  name: string;
  size: number;
};

const homepageFallbackReplies = [
  {
    matches: [
      "what does the agent actually do",
      "what does the agent do",
      "what does this actually do",
      "what does this do",
    ],
    output:
      "Career AI's agent turns your Career ID into a recruiter-ready trust layer. It uses the identity, work history, education, and supporting proof inside your Career ID to help HR teams and recruiters understand your background, ask better questions, and trust what they're seeing faster. Instead of relying on a resume alone, they get a clearer, evidence-backed view of who you are, what you've done, and what has been verified.",
  },
  {
    matches: ["resume builder", "different from a resume"],
    output:
      "A resume builder helps you format a story. Career AI helps you prove it. The platform is designed to attach verified identity, employment, and trust signals to the candidate so employers can move faster with more confidence.",
  },
  {
    matches: [
      "get hired faster",
      "why should i do this",
      "why do this",
      "why does this matter",
    ],
    output:
      "It helps you get hired faster by reducing recruiter doubt. When employers can see verified identity, supporting evidence, and a clear audit trail, they spend less time second-guessing claims and more time moving qualified candidates forward.",
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

  return `${matchedFallback.output}${buildAttachmentSuffix(attachments)}`;
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
    return `I can see your attached files.${buildAttachmentSuffix(attachments)} Add a question about what you want reviewed, compared, or summarized and I can help from there.`;
  }

  return `Career AI is a verified career identity platform for job seekers. It helps candidates turn claims into evidence-backed credibility so employers can trust them faster and make hiring decisions with less uncertainty.${buildAttachmentSuffix(attachments)}`;
}
