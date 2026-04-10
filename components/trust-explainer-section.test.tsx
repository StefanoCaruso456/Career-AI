import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { landingContentByPersona } from "@/components/chat-home-shell-content";
import { TrustExplainerSection } from "@/components/trust-explainer-section";

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

describe("TrustExplainerSection", () => {
  it("renders the shared trust copy and job seeker CTA", () => {
    render(<TrustExplainerSection content={landingContentByPersona.job_seeker.trustExplainer} />);

    expect(screen.getByRole("heading", { name: "How secure Career ID works" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Job seekers build verified credibility over time. Hiring agents can request trusted information securely through agent-to-agent communication.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Build verified credibility")).toBeInTheDocument();
    expect(screen.getByText("Share securely")).toBeInTheDocument();
    expect(screen.getByText("Verify faster")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start Building Career ID/i })).toHaveAttribute(
      "href",
      "/agent-build",
    );
  });

  it("uses the employer-specific CTA while keeping the shared trust content", () => {
    render(<TrustExplainerSection content={landingContentByPersona.employer.trustExplainer} />);

    expect(screen.getByRole("link", { name: /See How Verification Works/i })).toHaveAttribute(
      "href",
      "#solutions",
    );
    expect(
      screen.getByText(
        "Portable. Verified. Secure. Built for faster trust between job seekers and hiring teams.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText(
        "Illustration of secure agent-to-agent communication around verified Career ID trust.",
      ),
    ).toHaveAttribute("src", "/career-id-a2a-trust.png");
  });
});
