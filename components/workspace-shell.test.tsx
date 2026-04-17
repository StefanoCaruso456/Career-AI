import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "@/components/workspace-shell";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

describe("WorkspaceShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workspace copy and keeps the matching tab active", () => {
    mocks.usePathname.mockReturnValue("/account/access-requests");

    render(
      <WorkspaceShell
        eyebrow="Career workspace"
        summary="Manage your Career ID, access requests, and account settings from one workspace."
        tabs={[
          { href: "/account", label: "Overview" },
          { href: "/account/access-requests", label: "Access requests" },
          { href: "/account/settings", label: "Settings" },
        ]}
      >
        <div>Workspace body</div>
      </WorkspaceShell>,
    );

    expect(screen.getByText("Career workspace")).toBeInTheDocument();
    expect(
      screen.getByText("Manage your Career ID, access requests, and account settings from one workspace."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Access requests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Workspace body")).toBeInTheDocument();
  });

  it("respects exact-match tabs without marking nested routes current", () => {
    mocks.usePathname.mockReturnValue("/account/settings/profile");

    render(
      <WorkspaceShell
        eyebrow="Career workspace"
        summary="Account shell"
        tabs={[
          { href: "/account", label: "Overview" },
          { href: "/account/settings", label: "Settings", match: "exact" },
        ]}
      >
        <div>Workspace body</div>
      </WorkspaceShell>,
    );

    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });
});
