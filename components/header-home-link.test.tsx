import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderHomeLink } from "@/components/header-home-link";
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

vi.mock("next/image", () => ({
  default: ({ alt, fill: _fill, priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => <img {...props} alt={alt ?? ""} />,
}));

describe("HeaderHomeLink", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  it("marks the home link as current on the home route", () => {
    mockUsePathname.mockReturnValue("/");

    render(<HeaderHomeLink />);

    const link = screen.getByRole("link", { name: "Career AI home" });
    const logo = link.querySelector("img");

    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass(styles.homeAction);
    expect(link).toHaveClass(styles.homeActionCurrent);
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute("src", "/career-ai-header-logo.png");
  });

  it("does not mark the home link as current away from home", () => {
    mockUsePathname.mockReturnValue("/jobs");

    render(<HeaderHomeLink />);

    const link = screen.getByRole("link", { name: "Career AI home" });
    expect(link).not.toHaveAttribute("aria-current");
    expect(link).toHaveClass(styles.homeAction);
    expect(link).not.toHaveClass(styles.homeActionCurrent);
  });

  it("routes employer client pages back to the employer overview", () => {
    mockUsePathname.mockReturnValue("/employer/agent-sorcerer");

    render(<HeaderHomeLink />);

    const link = screen.getByRole("link", { name: "Career AI home" });
    expect(link).toHaveAttribute("href", "/employer");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("marks the employer overview as current when already in the employer home", () => {
    mockUsePathname.mockReturnValue("/employer");

    render(<HeaderHomeLink />);

    const link = screen.getByRole("link", { name: "Career AI home" });
    expect(link).toHaveAttribute("href", "/employer");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass(styles.homeActionCurrent);
  });

  it("uses the replacement header logo asset", () => {
    mockUsePathname.mockReturnValue("/");

    render(<HeaderHomeLink />);

    const link = screen.getByRole("link", { name: "Career AI home" });
    const logo = link.querySelector("img");

    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute("src", "/career-ai-header-logo.png");
    expect(logo).not.toHaveAttribute("src", "/career-ai-home-mark.png");
  });

  it("keeps shared settings routes pointed at the public home", () => {
    mockUsePathname.mockReturnValue("/settings");

    render(<HeaderHomeLink />);

    const link = screen.getByRole("link", { name: "Career AI home" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("keeps onboarding routes pointed at the public home", () => {
    mockUsePathname.mockReturnValue("/onboarding");

    render(<HeaderHomeLink />);

    const link = screen.getByRole("link", { name: "Career AI home" });
    expect(link).toHaveAttribute("href", "/");
  });
});
