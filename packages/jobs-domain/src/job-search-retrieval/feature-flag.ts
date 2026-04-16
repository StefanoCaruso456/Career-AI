export function isJobSearchRetrievalV2Enabled() {
  const value = process.env.JOB_SEARCH_RETRIEVAL_V2_ENABLED?.trim().toLowerCase();

  return value === "1" || value === "true" || value === "yes" || value === "on";
}
