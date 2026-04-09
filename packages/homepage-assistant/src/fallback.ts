const homepageFallbackReplies = [
  {
    matches: ["what does the agent actually do", "what does the agent do"],
    output:
      "Career AI verifies identity, work history, and supporting signals so employers can review a candidate with more trust. Instead of relying on a static resume alone, it builds a portable credibility profile with evidence, audit history, and recruiter-facing verification context.",
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

export function getFallbackHomepageReply(message: string) {
  const normalizedMessage = message.trim().toLowerCase();
  const matchedFallback = homepageFallbackReplies.find(({ matches }) =>
    matches.some((match) => normalizedMessage.includes(match)),
  );

  if (matchedFallback) {
    return matchedFallback.output;
  }

  return "Career AI is a verified career identity platform for job seekers. It helps candidates turn claims into evidence-backed credibility so employers can trust them faster and make hiring decisions with less uncertainty.";
}
