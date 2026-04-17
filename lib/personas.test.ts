import { describe, expect, it } from "vitest";
import {
  defaultPersona,
  getAuthCallbackUrl,
  getPersona,
  getPersonaFromRoleType,
  getPersonaFromRoute,
  getPersonaSignInRoute,
  getPostAuthRoute,
  getSettingsRoute,
  resolveActivePersona,
} from "@/lib/personas";

describe("persona helpers", () => {
  it("defaults to the job seeker persona", () => {
    expect(getPersona(undefined)).toBe(defaultPersona);
    expect(getPersona("unknown")).toBe(defaultPersona);
  });

  it("returns the configured post-auth routes", () => {
    expect(getPostAuthRoute("job_seeker")).toBe("/account");
    expect(getPostAuthRoute("employer")).toBe("/employer");
    expect(getSettingsRoute("job_seeker")).toBe("/account/settings");
    expect(getSettingsRoute("employer")).toBe("/employer/settings");
  });

  it("infers a persona from its landing route", () => {
    expect(getPersonaFromRoute("/account")).toBe("job_seeker");
    expect(getPersonaFromRoute("/account/settings")).toBe("job_seeker");
    expect(getPersonaFromRoute("/employer?tab=overview")).toBe("employer");
    expect(getPersonaFromRoute("/employer/candidates")).toBe("employer");
    expect(getPersonaFromRoute("/agent-build")).toBeNull();
    expect(getPersonaFromRoute("/accounting")).toBeNull();
  });

  it("maps persisted role types back to personas", () => {
    expect(getPersonaFromRoleType("candidate")).toBe("job_seeker");
    expect(getPersonaFromRoleType("recruiter")).toBe("employer");
    expect(getPersonaFromRoleType("hiring_manager")).toBe("employer");
    expect(getPersonaFromRoleType("unknown")).toBeNull();
  });

  it("prefers the explicit route, then role type, then stored preference", () => {
    expect(
      resolveActivePersona({
        preferredPersona: "job_seeker",
        roleType: "recruiter",
        route: "/settings",
      }),
    ).toBe("employer");
    expect(
      resolveActivePersona({
        preferredPersona: "employer",
        roleType: "candidate",
        route: "/account/settings",
      }),
    ).toBe("job_seeker");
  });

  it("keeps safe internal callback urls and falls back to the persona route", () => {
    expect(getAuthCallbackUrl({ callbackUrl: "/agent-build", persona: "job_seeker" })).toBe(
      "/agent-build",
    );
    expect(getAuthCallbackUrl({ callbackUrl: "https://example.com", persona: "employer" })).toBe(
      "/employer",
    );
  });

  it("builds sign-in routes with persona-aware params", () => {
    expect(getPersonaSignInRoute({ persona: "job_seeker" })).toBe("/sign-in");
    expect(getPersonaSignInRoute({ callbackUrl: "/employer", persona: "employer" })).toBe(
      "/sign-in?callbackUrl=%2Femployer&persona=employer",
    );
  });
});
