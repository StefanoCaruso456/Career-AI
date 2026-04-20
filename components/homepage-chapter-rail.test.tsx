import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HomepageChapterRail,
  type HomepageChapter,
} from "@/components/homepage-chapter-rail";

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

class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomepageChapterRail", () => {
  it("renders the current homepage chapters and starts on the first section", () => {
    const chapters: HomepageChapter[] = [
      { id: "platform", label: "Platform", summary: "Lead with the trust model." },
      { id: "stories", label: "Stories", summary: "Show the outcomes." },
      { id: "solutions", label: "Solutions", summary: "Map the product surface." },
    ];

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(<HomepageChapterRail chapters={chapters} />);

    expect(screen.getByText("Scroll Story")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Platform" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
      "href",
      "#stories",
    );
    expect(screen.getByText("Lead with the trust model.")).toBeInTheDocument();
  });
});
