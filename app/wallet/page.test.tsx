import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("WalletPage", () => {
  it("renders the coming soon message", async () => {
    const WalletPage = (await import("@/app/wallet/page")).default;

    render(<WalletPage />);

    expect(screen.getByRole("heading", { name: "Coming Soon" })).toBeInTheDocument();
  });
});
