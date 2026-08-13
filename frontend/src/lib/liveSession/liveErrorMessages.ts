/** User-friendly copy for live session errors — never show raw API strings in UI. */
export function mapLiveSubmitError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already answered")) return "Your answer was already recorded.";
  if (m.includes("not currently active")) return "The instructor moved to the next question. Your previous answer was saved.";
  if (m.includes("session has ended") || m.includes("not active")) return "This session has ended.";
  if (m.includes("connection") || m.includes("network")) return "Connection issue — we'll retry automatically.";
  if (m.includes("submit failed")) return "Couldn't save your answer. Try again in a moment.";
  return "Something went wrong. Please try again.";
}

export function mapLiveHostError(message: string): string {
  if (message.startsWith("VALIDATION_ERRORS:")) return message;
  const m = message.toLowerCase();
  if (m.includes("no participants")) return "Wait for at least one student to join before starting.";
  if (m.includes("not ready") || m.includes("validation")) return "This quiz isn't ready for live play. Check question content in the builder.";
  if (m.includes("not active")) return "The session isn't active right now.";
  if (m.includes("finished")) return "This session has already ended.";
  return message.length > 120 ? "Couldn't complete that action. Try again." : message;
}
