import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevelopmentNoticeBanner } from "./DevelopmentNoticeBanner";

describe("DevelopmentNoticeBanner", () => {
  it("renders the exact requested announcement message", () => {
    render(<DevelopmentNoticeBanner />);

    const announcementText =
      "We're currently building something great! The GateHub platform is under development. We'll notify you as soon as it's ready. Stay tuned!";

    expect(screen.getByText(/We're currently building something great!/i)).toBeTruthy();
    expect(
      screen.getByText(
        /The GateHub platform is under development\. We'll notify you as soon as it's ready\. Stay tuned!/i
      )
    ).toBeTruthy();

    const bannerSection = screen.getByRole("complementary", { name: /Platform Announcement/i });
    expect(bannerSection).toBeTruthy();
    expect(bannerSection.textContent).toContain(announcementText);
  });
});
