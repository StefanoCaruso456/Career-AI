const recruiterQuestionStarts = /^(how|what|why|can|could|should|would|is|are|do|does|did)\b/i;
const sourcingVerbs = /\b(find|source|search|match|shortlist|screen|surface|pull|rank)\b/i;
const sourcingTargets = /\b(candidate|candidates|talent|people|profiles)\b/i;
const titleKeywords =
  /\b(engineer|developer|manager|designer|analyst|scientist|architect|recruiter|marketer|consultant|director|lead|specialist|coordinator)\b/i;

export function isEmployerCandidateSearchIntent(prompt: string) {
  const normalizedPrompt = prompt.replace(/\s+/g, " ").trim();

  if (!normalizedPrompt) {
    return false;
  }

  if (
    normalizedPrompt.length >= 260 ||
    /\n/.test(prompt) ||
    /\b(job description|responsibilities|requirements|qualifications|must have|nice to have)\b/i.test(
      normalizedPrompt,
    )
  ) {
    return true;
  }

  if (recruiterQuestionStarts.test(normalizedPrompt) && !sourcingVerbs.test(normalizedPrompt)) {
    return false;
  }

  if (sourcingVerbs.test(normalizedPrompt) && sourcingTargets.test(normalizedPrompt)) {
    return true;
  }

  if (sourcingVerbs.test(normalizedPrompt) && titleKeywords.test(normalizedPrompt)) {
    return true;
  }

  if (
    normalizedPrompt.split(/\s+/).length <= 8 &&
    !/[?!]/.test(normalizedPrompt) &&
    titleKeywords.test(normalizedPrompt)
  ) {
    return true;
  }

  return false;
}
