import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderCenterTab } from "@/components/header-center-tab";
import styles from "@/components/floating-site-header.module.css";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("HeaderCenterTab", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  it("keeps the public center tabs visible inside the account client", () => {
    mockUsePathname.mockReturnValue("/account/settings");

    render(<HeaderCenterTab />);

    expect(screen.getByRole("link", { name: "Career ID" })).toHaveAttribute("href", "/agent-build");
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/jobs");
  });

  it("renders Agent Sorcerer in the floating header for employer routes", () => {
    mockUsePathname.mockReturnValue("/employer");

    render(<HeaderCenterTab />);

    const link = screen.getByRole("link", { name: "Agent Sorcerer" });
    expect(link).toHaveAttribute("href", "/employer/agent-sorcerer");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("marks Agent Sorcerer as current on the employer agent route", () => {
    mockUsePathname.mockReturnValue("/employer/agent-sorcerer");

    render(<HeaderCenterTab />);

    const link = screen.getByRole("link", { name: "Agent Sorcerer" });
    expect(link).toHaveAttribute("href", "/employer/agent-sorcerer");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass(styles.navTabCurrent);
  });

  it("renders the Career ID label for the agent-build tab", () => {
    mockUsePathname.mockReturnValue("/agent-build");

    render(<HeaderCenterTab />);

    const link = screen.getByRole("link", { name: "Career ID" });
    expect(link).toHaveAttribute("href", "/agent-build");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass(styles.navTabCurrent);
  });

  it("keeps shared settings routes on the public navigation tabs", () => {
    mockUsePathname.mockReturnValue("/settings");

    render(<HeaderCenterTab />);

    expect(screen.getByRole("link", { name: "Career ID" })).toHaveAttribute("href", "/agent-build");
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/jobs");
    expect(screen.queryByRole("link", { name: "Agent Sorcerer" })).not.toBeInTheDocument();
  });

  it("keeps onboarding routes on the public navigation tabs", () => {
    mockUsePathname.mockReturnValue("/onboarding");

    render(<HeaderCenterTab />);

    expect(screen.getByRole("link", { name: "Career ID" })).toHaveAttribute("href", "/agent-build");
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/jobs");
    expect(screen.queryByRole("link", { name: "Agent Sorcerer" })).not.toBeInTheDocument();
  });
});
