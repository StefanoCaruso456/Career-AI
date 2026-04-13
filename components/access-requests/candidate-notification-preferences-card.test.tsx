import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidateNotificationPreferencesCard } from "./candidate-notification-preferences-card";

describe("CandidateNotificationPreferencesCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates SMS alert preferences when a phone number is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        accessRequestEmailEnabled: true,
        accessRequestSmsEnabled: true,
        phoneNumberConfigured: true,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <CandidateNotificationPreferencesCard
        initialPhoneOptional="+1 555 0100"
        initialPreferences={{
          accessRequestEmailEnabled: true,
          accessRequestSmsEnabled: false,
          phoneNumberConfigured: true,
          updatedAt: "2026-04-13T00:00:00.000Z",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /enable sms/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/me/notification-preferences",
        expect.objectContaining({
          method: "PATCH",
        }),
      );
    });
    expect(await screen.findByText("SMS alerts enabled.")).toBeInTheDocument();
  });
});
