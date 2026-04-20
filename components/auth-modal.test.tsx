import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthModalTrigger } from "@/components/auth-modal";

vi.mock("@/components/use-google-auth-status", () => ({
  useGoogleAuthStatus: () => ({
    isLoading: false,
    status: {
      disabledMessage: "Google auth is disabled.",
      enabled: true,
    },
  }),
}));

vi.mock("@/components/google-sign-in-button", () => ({
  GoogleSignInButton: ({
    callbackUrl,
    label,
    persona,
  }: {
    callbackUrl: string;
    label: string;
    persona?: string;
  }) => (
    <div data-callback-url={callbackUrl} data-persona={persona} data-testid="google-button">
      {label}
    </div>
  ),
}));

describe("AuthModalTrigger", () => {
  it("keeps auth mode and persona as separate controls and updates the callback route by persona", () => {
    render(
      <AuthModalTrigger
        defaultMode="signup"
        label="Get started"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));

    expect(screen.getByRole("heading", { name: "Create your Career AI account" })).toBeInTheDocument();
    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Experience")).toBeInTheDocument();

    const googleButton = screen.getByTestId("google-button");
    expect(googleButton).toHaveAttribute("data-callback-url", "/account");
    expect(googleButton).toHaveAttribute("data-persona", "job_seeker");

    fireEvent.click(screen.getByRole("button", { name: "Employer" }));

    expect(screen.getByRole("heading", { name: "Create your employer workspace" })).toBeInTheDocument();
    expect(screen.getByTestId("google-button")).toHaveAttribute(
      "data-callback-url",
      "/employer",
    );
    expect(screen.getByTestId("google-button")).toHaveAttribute("data-persona", "employer");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("heading", { name: "Sign in to Career AI for Employers" })).toBeInTheDocument();
    expect(screen.getByTestId("google-button")).toHaveAttribute(
      "data-callback-url",
      "/employer",
    );
  });

  it("lets people toggle password visibility in the form", () => {
    render(<AuthModalTrigger defaultMode="signin" label="Open auth" />);

    fireEvent.click(screen.getByRole("button", { name: "Open auth" }));

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
