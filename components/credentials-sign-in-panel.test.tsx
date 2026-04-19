import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsSignInPanel } from "@/components/credentials-sign-in-panel";

const mockSignIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

describe("CredentialsSignInPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets people toggle password visibility", () => {
    render(<CredentialsSignInPanel callbackUrl="/account" />);

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("submits normalized credentials and redirects on success", async () => {
    const redirectSpy = vi.fn();
    mockSignIn.mockResolvedValue({
      error: undefined,
      url: "/employer",
    });

    render(
      <CredentialsSignInPanel
        callbackUrl="/employer"
        onSuccessRedirect={redirectSpy}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: {
        value: "Returning.User@Example.com ",
      },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: {
        value: "supersecret1",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with email" }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        callbackUrl: "/employer",
        email: "returning.user@example.com",
        password: "supersecret1",
        redirect: false,
      });
    });
    await waitFor(() => {
      expect(redirectSpy).toHaveBeenCalledWith("/employer");
    });
  });
});
