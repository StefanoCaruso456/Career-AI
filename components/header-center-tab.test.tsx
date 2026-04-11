import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderCenterTab } from "@/components/header-center-tab";
import styles from "@/components/floating-site-header.module.css";

const mockUsePathname = vi.fn();
const mockUseSession = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
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
    window.localStorage.clear();
    mockUsePathname.mockReset();
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
    });
  });

  it("hides the public center tabs inside the account client", () => {
    mockUsePathname.mockReturnValue("/account/settings");

    const { container } = render(<HeaderCenterTab />);

    expect(container).toBeEmptyDOMElement();
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

  it("keeps employer navigation visible on generic settings routes for recruiter sessions", () => {
    mockUsePathname.mockReturnValue("/settings");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          roleType: "recruiter",
        },
      },
      status: "authenticated",
    });

    render(<HeaderCenterTab />);

    expect(screen.getByRole("link", { name: "Agent Sorcerer" })).toHaveAttribute(
      "href",
      "/employer/agent-sorcerer",
    );
    expect(screen.queryByRole("link", { name: "Career ID" })).not.toBeInTheDocument();
  });
});
