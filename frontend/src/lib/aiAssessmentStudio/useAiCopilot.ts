import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAiAssessmentStore } from "./store";
import { runCopilotAction, streamCopilotCommand, getAiJobStatus } from "./copilotApi";
import { parseCopilotCommand } from "./commandParser";
import type { CopilotIntent } from "./copilotTypes";
import type { AiGeneratedQuestion } from "./types";

export function useAiCopilot() {
  const preview = useAiAssessmentStore((s) => s.preview);
  const bulkSelected = useAiAssessmentStore((s) => s.bulkSelected);
  const pushCopilotMessage = useAiAssessmentStore((s) => s.pushCopilotMessage);
  const updateLastCopilotMessage = useAiAssessmentStore((s) => s.updateLastCopilotMessage);
  const setCopilotStream = useAiAssessmentStore((s) => s.setCopilotStream);
  const applyQuestions = useAiAssessmentStore((s) => s.applyQuestions);
  const setPendingComparison = useAiAssessmentStore((s) => s.setPendingComparison);
  const setAiEditing = useAiAssessmentStore((s) => s.setAiEditing);

  const jobId = preview?.jobId;

  const applyResult = useCallback(
    (
      questions: AiGeneratedQuestion[],
      message: string,
      modifiedIds: string[],
      comparisons?: Array<{ questionId: string; original: AiGeneratedQuestion; improved: AiGeneratedQuestion }>
    ) => {
      if (comparisons?.length === 1) {
        setPendingComparison(comparisons[0]!);
      } else {
        applyQuestions(questions, message, "copilot", modifiedIds);
      }
      setCopilotStream({ active: false, stage: "" });
      modifiedIds.forEach((id) => setAiEditing(id, false));
    },
    [applyQuestions, setCopilotStream, setPendingComparison, setAiEditing]
  );

  const commandMutation = useMutation({
    mutationFn: async (command: string) => {
      if (!jobId || !preview) throw new Error("No assessment loaded");
      const parsed = parseCopilotCommand(command);
      const qIds = bulkSelected.size
        ? [...bulkSelected]
        : parsed.questionIndices.map((i) => preview.questions[i]?.id).filter(Boolean) as string[];

      pushCopilotMessage({ role: "user", text: command });
      pushCopilotMessage({ role: "assistant", text: "", streaming: true });
      setCopilotStream({ active: true, stage: "Parsing command…" });

      qIds.forEach((id) => setAiEditing(id, true));

      let summary = "";
      let modifiedIds: string[] = [];
      let streamedQuestions: AiGeneratedQuestion[] | null = null;

      const streamRes = await streamCopilotCommand(jobId, command, qIds.length ? qIds : undefined, (e) => {
        if (e.type === "stage") setCopilotStream({ active: true, stage: e.message });
        if (e.type === "question_updated") {
          setCopilotStream({ active: true, stage: `Updating question…`, questionId: e.questionId });
        }
        if (e.type === "questions_replaced") {
          streamedQuestions = e.questions;
        }
        if (e.type === "done") {
          summary = e.summary;
          modifiedIds = e.modifiedIds;
          updateLastCopilotMessage(e.summary, false);
        }
        if (e.type === "message") updateLastCopilotMessage(e.text, false);
      });

      if (streamRes.error) {
        const { runCopilotCommand } = await import("./copilotApi");
        const res = await runCopilotCommand(jobId, command, qIds.length ? qIds : undefined);
        if (res.error || !res.data) throw new Error(res.error || "Command failed");
        return res.data;
      }

      if (streamedQuestions) {
        return { questions: streamedQuestions, message: summary || "Done.", modifiedIds };
      }

      const status = await getAiJobStatus(jobId);
      if (status.data?.preview) {
        return {
          questions: status.data.preview.questions,
          message: summary || "Assessment updated.",
          modifiedIds,
        };
      }

      throw new Error("Could not load updated assessment");
    },
    onSuccess: (data) => {
      if (!preview) return;
      updateLastCopilotMessage(data.message, false);
      applyResult(data.questions, data.message, data.modifiedIds);
    },
    onError: (err: Error) => {
      updateLastCopilotMessage(err.message || "Something went wrong.", false);
      setCopilotStream({ active: false, stage: "" });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ intent, questionIds }: { intent: CopilotIntent; questionIds?: string[] }) => {
      if (!jobId) throw new Error("No assessment loaded");
      const ids = questionIds?.length ? questionIds : bulkSelected.size ? [...bulkSelected] : undefined;
      setCopilotStream({ active: true, stage: "AI is working…" });
      ids?.forEach((id) => setAiEditing(id, true));
      const res = await runCopilotAction(jobId, intent, ids);
      if (res.error || !res.data) throw new Error(res.error || "Action failed");
      return res.data;
    },
    onSuccess: (data) => {
      applyResult(data.questions, data.message, data.modifiedIds, data.comparisons);
      pushCopilotMessage({ role: "assistant", text: data.message });
    },
    onError: (err: Error) => {
      pushCopilotMessage({ role: "assistant", text: err.message });
      setCopilotStream({ active: false, stage: "" });
    },
  });

  return {
    sendCommand: (command: string) => commandMutation.mutate(command),
    runAction: (intent: CopilotIntent, questionIds?: string[]) => actionMutation.mutate({ intent, questionIds }),
    isBusy: commandMutation.isPending || actionMutation.isPending,
  };
}
