import { describe, expect, it } from "vitest";
import {
  getLikelyEmployerCandidateNameLookup,
  isLikelyEmployerCandidateNameLookup,
} from "./recruiter-name-lookup";

describe("recruiter-name-lookup", () => {
  it("detects simple full-name lookups", () => {
    expect(getLikelyEmployerCandidateNameLookup("stefano caruso")).toBe("stefano caruso");
    expect(isLikelyEmployerCandidateNameLookup("Alex Rivera")).toBe(true);
  });

  it("rejects common non-name recruiter prompts", () => {
    expect(isLikelyEmployerCandidateNameLookup("software engineer")).toBe(false);
    expect(isLikelyEmployerCandidateNameLookup("machine learning")).toBe(false);
    expect(isLikelyEmployerCandidateNameLookup("find aligned candidates")).toBe(false);
    expect(isLikelyEmployerCandidateNameLookup("TAID-000123")).toBe(false);
  });
});
