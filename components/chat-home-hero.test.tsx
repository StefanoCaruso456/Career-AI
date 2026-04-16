import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatHomeHero } from "@/components/chat-home-hero";
import styles from "@/components/chat-home-shell.module.css";

vi.mock("@/components/hero-composer", () => ({
  HeroComposer: () => <div data-testid="hero-composer" />,
}));

describe("ChatHomeHero", () => {
  it("uses the compact embedded layout when rendered inside a workspace shell", () => {
    const { container } = render(
      <ChatHomeHero
        embeddedInWorkspaceShell
        heroComposer={{
          composerPlaceholder: "Ask about candidate credibility.",
          initialProjects: [],
          starterActions: [],
          typingLabel: "Thinking...",
        }}
        heroTitle="Career AI helps employers verify candidate credibility faster."
      />,
    );

    const heroSection = container.querySelector("section");
    const heroInner = container.querySelector(`.${styles.heroInner}`);
    const title = screen.getByRole("heading", {
      name: "Career AI helps employers verify candidate credibility faster.",
    });

    expect(heroSection).toHaveClass(styles.heroSectionEmbedded);
    expect(heroInner).toHaveClass(styles.heroInnerEmbedded);
    expect(title).toHaveClass(styles.heroTitleEmbedded);
  });

  it("renders a smaller second hero line when the title includes a line break", () => {
    render(
      <ChatHomeHero
        heroComposer={{
          composerPlaceholder: "Ask about candidate credibility.",
          initialProjects: [],
          starterActions: [],
          typingLabel: "Thinking...",
        }}
        heroTitle={"Get hired faster\nA secure career identity platform"}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Get hired faster A secure career identity platform",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Get hired faster")).toHaveClass(styles.heroTitleLead);
    expect(screen.getByText("A secure career identity platform")).toHaveClass(
      styles.heroTitleSubline,
    );
  });
});
