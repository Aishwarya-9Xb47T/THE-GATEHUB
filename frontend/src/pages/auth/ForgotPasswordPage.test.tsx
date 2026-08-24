import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

const apiMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => apiMock(...args),
}));

vi.mock("@/components/common/Logo", () => ({
  BrandHomeButton: () => <div>THE GATEHUB</div>,
}));

async function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
}

describe("ForgotPasswordPage email states", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("shows success only when the API confirms email acceptance", async () => {
    apiMock.mockResolvedValue({
      data: {
        success: true,
        message: "If an account exists for this email, we've sent password reset instructions.",
      },
    });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    await submitEmail("user@example.com");

    await waitFor(() => {
      expect(screen.getByTestId("forgot-password-success")).toBeTruthy();
    });
    expect(screen.queryByTestId("forgot-password-error")).toBeNull();
    expect(screen.getByText(/we've sent password reset instructions/i)).toBeTruthy();
  });

  it("exits loading and shows an error when the API reports email failure (no fake success)", async () => {
    apiMock.mockResolvedValue({
      error: "Unable to send the reset email right now. Please try again.",
      data: { success: false, error: "Unable to send the reset email right now. Please try again." },
    });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    await submitEmail("user@example.com");

    await waitFor(() => {
      expect(screen.getByTestId("forgot-password-error")).toBeTruthy();
    });
    expect(screen.queryByTestId("forgot-password-success")).toBeNull();
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeTruthy();
    expect(screen.queryByText(/sending link/i)).toBeNull();
  });

  it("exits loading and shows an error on abort/timeout (no fake success)", async () => {
    apiMock.mockResolvedValue({ error: "Request cancelled" });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    await submitEmail("user@example.com");

    await waitFor(() => {
      expect(screen.getByTestId("forgot-password-error").textContent).toMatch(/unable to send/i);
    });
    expect(screen.queryByTestId("forgot-password-success")).toBeNull();
  });
});
