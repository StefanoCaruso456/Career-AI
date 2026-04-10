import { describe, expect, it } from "vitest";
import {
  defaultPersona,
  getAuthCallbackUrl,
  getPersona,
  getPersonaFromRoute,
  getPersonaSignInRoute,
  getPostAuthRoute,
} from "@/lib/personas";

describe("persona helpers", () => {
  it("defaults to the job seeker persona", () => {
    expect(getPersona(undefined)).toBe(defaultPersona);
    expect(getPersona("unknown")).toBe(defaultPersona);
  });

  it("returns the configured post-auth routes", () => {
    expect(getPostAuthRoute("job_seeker")).toBe("/account");
    expect(getPostAuthRoute("employer")).toBe("/employer");
  });

  it("infers a persona from its landing route", () => {
    expect(getPersonaFromRoute("/account")).toBe("job_seeker");
    expect(getPersonaFromRoute("/account/settings")).toBe("job_seeker");
    expect(getPersonaFromRoute("/employer?tab=overview")).toBe("employer");
    expect(getPersonaFromRoute("/employer/candidates")).toBe("employer");
    expect(getPersonaFromRoute("/agent-build")).toBeNull();
    expect(getPersonaFromRoute("/accounting")).toBeNull();
  });

  it("keeps safe internal callback urls and falls back to the persona route", () => {
    expect(getAuthCallbackUrl({ callbackUrl: "/agent-build", persona: "job_seeker" })).toBe("/agent-build");
    expect(getAuthCallbackUrl({ callbackUrl: "https://example.com", persona: "employer" })).toBe("/employer");
  });

  it("builds sign-in routes with persona-aware params", () => {
    expect(getPersonaSignInRoute({ persona: "job_seeker" })).toBe("/sign-in");
    expect(getPersonaSignInRoute({ callbackUrl: "/employer", persona: "employer" })).toBe(
      "/sign-in?callbackUrl=%2Femployer&persona=employer",
    );
  });
});
