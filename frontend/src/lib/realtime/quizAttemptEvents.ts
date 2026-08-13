export interface QuizAttemptRealtimeEvent {
  type: "QUIZ_ATTEMPT_COMPLETED" | "QUIZ_ANALYTICS_REFRESH";
  attemptId?: string;
  quizId: string;
  userId?: string;
  occurredAt: string;
}

function getToken() {
  return localStorage.getItem("lms_token");
}

export function subscribeQuizAttemptEvents(onEvent: (event: QuizAttemptRealtimeEvent) => void) {
  const token = getToken();
  if (!token) return () => {};

  const controller = new AbortController();

  const openStreamLoop = async () => {
    while (!controller.signal.aborted) {
      try {
        const res = await fetch("/api/quizzes/my/attempt-events", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";
          for (const chunk of chunks) {
            const line = chunk
              .split("\n")
              .find((entry) => entry.startsWith("data: "));
            if (!line) continue;
            try {
              const parsed = JSON.parse(line.slice(6)) as QuizAttemptRealtimeEvent;
              onEvent(parsed);
              window.dispatchEvent(new CustomEvent("gatehub:quiz-attempt-submitted", { detail: parsed }));
            } catch {
              // Ignore malformed event
            }
          }
        }
      } catch {
        // Ignore disconnect; retry while subscribed.
      }
      if (!controller.signal.aborted) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  };

  void openStreamLoop();

  return () => controller.abort();
}

