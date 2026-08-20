import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstructorPollResults, resolveOptionResult } from "./InstructorPollResults";

describe("InstructorPollResults", () => {
  const options = [
    { id: "opt_0", label: "A", text: "Option A" },
    { id: "opt_1", label: "B", text: "Option B" },
    { id: "opt_2", label: "C", text: "Option C" },
    { id: "opt_3", label: "D", text: "Option D" },
  ];

  it("renders live poll results in the main stage with counts and percentages", () => {
    render(
      <InstructorPollResults
        question="GRU are similar to the LSTM networks."
        options={options}
        summary={{
          totalResponses: 1,
          optionCounts: { A: 1, opt_0: 1 },
          respondents: { A: [{ userId: "u1", firstName: "N S", lastName: "Aishwarya" }] },
        }}
        participantCount={1}
        onClosePoll={() => undefined}
      />,
    );
    expect(screen.getByTestId("classroom-poll-stage").textContent).toContain("LIVE POLL");
    expect(screen.getByText("GRU are similar to the LSTM networks.")).toBeTruthy();
    expect(screen.getByText(/Total responses: 1 \/ 1/)).toBeTruthy();
    expect(screen.getByTestId("classroom-poll-option-A").textContent).toContain("100%");
    expect(screen.getByTestId("classroom-poll-option-B").textContent).toContain("0%");
  });

  it("opens the student list for a clicked option without closing the poll", () => {
    const onClosePoll = vi.fn();
    render(
      <InstructorPollResults
        question="GRU are similar to the LSTM networks."
        options={options}
        summary={{
          totalResponses: 1,
          optionCounts: { A: 1 },
          respondents: { A: [{ userId: "u1", firstName: "N S", lastName: "Aishwarya" }] },
        }}
        participantCount={1}
        onClosePoll={onClosePoll}
      />,
    );
    fireEvent.click(screen.getByTestId("classroom-poll-option-A"));
    expect(screen.getByText("Students who selected A — Option A")).toBeTruthy();
    expect(screen.getByText("N S Aishwarya")).toBeTruthy();
    expect(onClosePoll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("classroom-poll-detail-close"));
    expect(screen.queryByText("Students who selected A — Option A")).toBeNull();
    expect(screen.getByTestId("classroom-poll-stage")).toBeTruthy();
  });

  it("computes zero percent when nobody has answered", () => {
    const row = resolveOptionResult({ label: "A", text: "Option A" }, 0, { totalResponses: 0, optionCounts: {} });
    expect(row.count).toBe(0);
    expect(row.percent).toBe(0);
  });
});
