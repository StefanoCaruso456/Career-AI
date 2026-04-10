import { beforeEach, describe, expect, it } from "vitest";
import {
  getPreferredPersonaFromCookieString,
  persistPreferredPersona,
  preferredPersonaCookieName,
  preferredPersonaStorageKey,
  readPreferredPersona,
} from "@/lib/persona-preference";

describe("persona preference helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${preferredPersonaCookieName}=; Max-Age=0; Path=/`;
  });

  it("reads the preferred persona from a cookie string", () => {
    expect(
      getPreferredPersonaFromCookieString(
        `${preferredPersonaCookieName}=employer; Path=/; SameSite=Lax`,
      ),
    ).toBe("employer");
  });

  it("persists the preferred persona to local storage and cookies", () => {
    persistPreferredPersona("employer");

    expect(window.localStorage.getItem(preferredPersonaStorageKey)).toBe("employer");
    expect(document.cookie).toContain(`${preferredPersonaCookieName}=employer`);
    expect(readPreferredPersona()).toBe("employer");
  });
});
