import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe("EmployerAgentSorcererPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects the retired employer agent sorcerer route to candidates", async () => {
    const Page = (await import("@/app/employer/agent-sorcerer/page")).default;

    Page();

    expect(mocks.redirect).toHaveBeenCalledWith("/employer/candidates");
  });
});
