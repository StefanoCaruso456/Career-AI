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

  it("hides the public center tabs inside route-scoped clients", () => {
    mockUsePathname.mockReturnValue("/account/settings");

    const { container } = render(<HeaderCenterTab />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Career ID label for the agent-build tab", () => {
    mockUsePathname.mockReturnValue("/agent-build");

    render(<HeaderCenterTab />);

    const link = screen.getByRole("link", { name: "Career ID" });
    expect(link).toHaveAttribute("href", "/agent-build");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass(styles.navTabCurrent);
  });
});
