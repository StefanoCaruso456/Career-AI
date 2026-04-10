import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeaderAuthControls } from "@/components/header-auth-controls";

const mockUseSession = vi.fn();
const mockUsePathname = vi.fn();

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => mockUseSession(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("@/components/auth-modal", () => ({
  AuthModalTrigger: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

describe("HeaderAuthControls", () => {
  it("links authenticated employer users back to the employer workspace", () => {
    window.localStorage.setItem("career-ai.preferred-persona", "employer");
    mockUsePathname.mockReturnValue("/");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          email: "alex@company.com",
          name: "Alex Rivera",
        },
      },
      status: "authenticated",
    });

    render(<HeaderAuthControls />);

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(screen.getByRole("menuitem", { name: /employer workspace/i })).toHaveAttribute(
      "href",
      "/employer",
    );
    expect(screen.getAllByText("Employer workspace")).toHaveLength(2);
  });
});
