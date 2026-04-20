import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { landingContentByPersona } from "@/components/chat-home-shell-content";
import { ScrollStorySection } from "@/components/scroll-story-section";

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

describe("ScrollStorySection", () => {
  it("renders the job seeker scrollytelling narrative with jump controls", () => {
    render(<ScrollStorySection content={landingContentByPersona.job_seeker.scrollStory!} />);

    expect(
      screen.getByRole("heading", {
        name: "From scattered proof to a Career ID you can reuse anywhere.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Start with the career proof you already have.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collect" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("link", { name: /Build Career ID/i })).toHaveAttribute(
      "href",
      "/agent-build",
    );
    expect(screen.getByRole("link", { name: /See Trust Workflows/i })).toHaveAttribute(
      "href",
      "#solutions",
    );
  });
});
