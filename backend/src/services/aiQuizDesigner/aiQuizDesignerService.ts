export async function logDesignerEvent(
  _userId: string,
  event: string,
  meta?: Record<string, unknown>
) {
  console.info("[AiQuizDesigner]", event, meta ?? {});
  return { logged: true };
}

export function validateDesignerPayload(body: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const b = body as Record<string, unknown>;
  if (!b?.title || typeof b.title !== "string" || !b.title.trim()) errors.push("title required");
  if (!b?.questionCount || Number(b.questionCount) < 1) errors.push("questionCount required");
  const composition = b?.composition as Record<string, number> | undefined;
  if (composition) {
    const sum = Object.values(composition).reduce((a, c) => a + c, 0);
    if (sum !== Number(b.questionCount)) {
      errors.push(`Question distribution (${sum}) must equal total (${b.questionCount})`);
    }
  }
  return { valid: errors.length === 0, errors };
}
