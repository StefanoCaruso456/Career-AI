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
});
