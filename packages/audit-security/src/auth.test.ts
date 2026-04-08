import { describe, expect, it } from "vitest";
import { ApiError } from "@/packages/contracts/src";
import { assertTalentIdentityAccess, getAuthenticatedActor } from "@/packages/audit-security/src";

describe("auth helpers", () => {
  it("supports anonymous system actor for public create flows", () => {
    const actor = getAuthenticatedActor(new Headers(), "corr-1", {
      allowAnonymousSystemActor: true,
    });

    expect(actor).toEqual({
      actorType: "system_service",
      actorId: "public_request",
    });
  });

  it("rejects missing actor headers when anonymous access is disabled", () => {
    expect(() => getAuthenticatedActor(new Headers(), "corr-1")).toThrow(ApiError);
  });

  it("blocks talent users from accessing another identity", () => {
    expect(() =>
      assertTalentIdentityAccess(
        {
          actorType: "talent_user",
          actorId: "tal_2",
        },
        "tal_1",
        "corr-1",
      ),
    ).toThrow(ApiError);
  });
});
