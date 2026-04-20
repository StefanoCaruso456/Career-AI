import { describe, expect, it } from "vitest";
import { isEmployerCandidateSearchIntent } from "@/lib/employer/is-candidate-search-intent";

describe("isEmployerCandidateSearchIntent", () => {
  it("treats recruiter sourcing prompts as candidate search intent", () => {
    expect(
      isEmployerCandidateSearchIntent(
        "Find aligned candidates for a senior product manager role in Austin.",
      ),
    ).toBe(true);
    expect(isEmployerCandidateSearchIntent("Software Engineer")).toBe(true);
  });

  it("treats direct Career ID and candidate lookups as sourcing intent", () => {
    expect(isEmployerCandidateSearchIntent("TAID-000123")).toBe(true);
    expect(isEmployerCandidateSearchIntent("tal_12345678-1234-4234-9234-123456789abc")).toBe(true);
    expect(isEmployerCandidateSearchIntent("share_12345678-1234-4234-9234-123456789abc")).toBe(
      true,
    );
  });

  it("treats a plain full name as candidate lookup intent", () => {
    expect(isEmployerCandidateSearchIntent("stefano caruso")).toBe(true);
    expect(isEmployerCandidateSearchIntent("machine learning")).toBe(false);
  });

  it("does not treat general employer questions as sourcing intent", () => {
    expect(
      isEmployerCandidateSearchIntent("How do we verify candidate credibility faster?"),
    ).toBe(false);
  });
});
