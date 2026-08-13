import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { LearnerExperiencePackage, LearnerExperienceStep, ProgressRule } from "../types";

export interface NodeProgress {
  completed: boolean;
  locked: boolean;
  visited: boolean;
  progress: number;
  timeSpent: number;
  lastVisited: string | null;
}

export type ProgressTree = Record<string, NodeProgress>;

const DEFAULT_NODE: NodeProgress = {
  completed: false,
  locked: true,
  visited: false,
  progress: 0,
  timeSpent: 0,
  lastVisited: null,
};

/** Isolated per student + course + published version */
function storageKey(universeId: string, publishVersionId: string) {
  return `lu-progress-v3:${universeId}:${publishVersionId}`;
}

function loadTree(universeId: string, publishVersionId: string): ProgressTree {
  if (!publishVersionId) return {};
  try {
    const raw = localStorage.getItem(storageKey(universeId, publishVersionId));
    return raw ? (JSON.parse(raw) as ProgressTree) : {};
  } catch {
    return {};
  }
}

function saveTree(universeId: string, publishVersionId: string, tree: ProgressTree) {
  if (!publishVersionId) return;
  try {
    localStorage.setItem(storageKey(universeId, publishVersionId), JSON.stringify(tree));
  } catch {
    /* quota exceeded */
  }
}

function serverRowToNode(row: {
  completed: boolean;
  visited: boolean;
  progress: number;
  timeSpent: number;
  lastVisited: string | null;
}): NodeProgress {
  return {
    completed: row.completed,
    visited: row.visited,
    progress: row.progress,
    timeSpent: row.timeSpent,
    lastVisited: row.lastVisited,
    locked: false,
  };
}

export function stepPedagogyRole(
  step: LearnerExperienceStep
): "takeaways" | "checkpoint" | "revision" | "default" {
  const blob = `${step.title} ${String(step.payload?.title ?? "")} ${String(step.payload?.blockType ?? "")}`.toLowerCase();
  if (step.kind === "summary" || /checkpoint/.test(blob)) return "checkpoint";
  if (/key\s*takeaway|takeaway|key\s*point|keypoints/.test(blob)) return "takeaways";
  if (/revision/.test(blob)) return "revision";
  return "default";
}

export function stepLabel(step: LearnerExperienceStep): string {
  const labels: Partial<Record<LearnerExperienceStep["kind"], string>> = {
    hero: "Introduction",
    overview: "Overview",
    objectives: "Learning Objectives",
    video: "Video",
    theory: "Topics",
    practice: "Practice",
    quiz: "Quiz",
    "coding-lab": "Coding Lab",
    notebook: "Notebook",
    project: "Project",
    research: "Research Paper",
    assignment: "Assignment",
    discussion: "Discussion",
    reflection: "Reflection",
    summary: "Checkpoint",
    downloads: "Resources",
    "next-lesson": "Next Lesson",
  };
  const role = stepPedagogyRole(step);
  if (role === "takeaways") return step.title?.trim() && !/^topics$/i.test(step.title) ? step.title : "Key takeaways";
  if (role === "revision") return step.title?.trim() || "Revision";
  if (step.kind === "summary" || role === "checkpoint") return step.title || "Checkpoint";
  if (step.kind === "theory" && step.title && step.title !== "Topics") return step.title;
  if (step.kind === "video" && step.title && step.title.trim()) return step.title.trim();
  return labels[step.kind] ?? step.title;
}

export function navigableSteps(steps: LearnerExperienceStep[]): LearnerExperienceStep[] {
  return steps.filter((s) => s.kind !== "next-lesson");
}

export function eventMatchesProgressRule(event: string, rule: ProgressRule): boolean {
  return event === rule.event;
}

export function getLessonProgressPercent(
  steps: LearnerExperienceStep[],
  getStepProgress: (stepId: string) => NodeProgress
): number {
  const nav = navigableSteps(steps);
  if (nav.length === 0) return 0;

  const required = nav.filter((s) => s.progressRule.requiredForCompletion);
  if (required.length === 0) {
    const visited = nav.filter((s) => getStepProgress(s.id).visited).length;
    return Math.round((visited / nav.length) * 100);
  }

  const done = required.filter((s) => getStepProgress(s.id).completed).length;
  return Math.round((done / required.length) * 100);
}

export function isLessonFullyComplete(
  steps: LearnerExperienceStep[],
  getStepProgress: (stepId: string) => NodeProgress
): boolean {
  return getLessonProgressPercent(steps, getStepProgress) === 100;
}

export function useLessonProgressTree(
  universeId: string,
  publishVersionId: string,
  experience: LearnerExperiencePackage | null,
  lessonId: string | null,
  steps: LearnerExperienceStep[],
  options?: { syncToServer?: boolean; isPreviewMode?: boolean }
) {
  const syncToServer = options?.syncToServer ?? true;
  const isPreviewMode = options?.isPreviewMode ?? false;
  const [tree, setTree] = useState<ProgressTree>(() => loadTree(universeId, publishVersionId));
  const serverLoadedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTree(loadTree(universeId, publishVersionId));
    serverLoadedRef.current = false;
  }, [universeId, publishVersionId]);

  useEffect(() => {
    if (!universeId || !publishVersionId || isPreviewMode || serverLoadedRef.current) return;
    serverLoadedRef.current = true;
    void (async () => {
      const res = await api<{
        success: boolean;
        steps: Array<{
          lessonId: string;
          stepId: string;
          completed: boolean;
          visited: boolean;
          progress: number;
          timeSpent: number;
          lastVisited: string | null;
        }>;
      }>(`/learning-universes/${universeId}/step-progress`);
      if (res.error || !res.data?.steps?.length) return;
      setTree((prev) => {
        const next = { ...prev };
        for (const row of res.data!.steps) {
          const key = `${row.lessonId}:${row.stepId}`;
          next[key] = serverRowToNode(row);
        }
        saveTree(universeId, publishVersionId, next);
        return next;
      });
    })();
  }, [universeId, publishVersionId, isPreviewMode]);

  const scheduleServerSync = useCallback(
    (lessonId: string, stepId: string, node: NodeProgress) => {
      if (!syncToServer || isPreviewMode || !universeId || !publishVersionId) return;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        void api(`/learning-universes/${universeId}/step-progress`, {
          method: "PATCH",
          body: {
            lessonId,
            stepId,
            completed: node.completed,
            visited: node.visited,
            progress: node.progress,
          },
        });
      }, 400);
    },
    [universeId, publishVersionId, syncToServer, isPreviewMode]
  );

  const persist = useCallback(
    (next: ProgressTree, sync?: { lessonId: string; stepId: string; node: NodeProgress }) => {
      setTree(next);
      saveTree(universeId, publishVersionId, next);
      if (sync) scheduleServerSync(sync.lessonId, sync.stepId, sync.node);
    },
    [universeId, publishVersionId, scheduleServerSync]
  );

  const initRef = useRef<string>("");

  useEffect(() => {
    if (!lessonId || steps.length === 0 || !publishVersionId) return;
    const signature = `${publishVersionId}:${lessonId}:${steps.map((s) => s.id).join(",")}`;
    if (initRef.current === signature) return;
    initRef.current = signature;

    setTree((prev) => {
      const next = { ...prev };
      let changed = false;
      navigableSteps(steps).forEach((step, index) => {
        const key = `${lessonId}:${step.id}`;
        if (!next[key]) {
          next[key] = { ...DEFAULT_NODE, locked: index > 0 };
          changed = true;
        } else if (index === 0 && next[key].locked) {
          next[key] = { ...next[key], locked: false };
          changed = true;
        }
      });
      if (changed) saveTree(universeId, publishVersionId, next);
      return changed ? next : prev;
    });
  }, [universeId, publishVersionId, lessonId, steps]);

  const getStepProgress = useCallback(
    (stepId: string): NodeProgress => {
      if (!lessonId) return DEFAULT_NODE;
      return tree[`${lessonId}:${stepId}`] ?? { ...DEFAULT_NODE, locked: false };
    },
    [lessonId, tree]
  );

  const markVisited = useCallback(
    (stepId: string) => {
      if (!lessonId) return;
      const key = `${lessonId}:${stepId}`;
      const navSteps = navigableSteps(steps);
      const index = navSteps.findIndex((s) => s.id === stepId);
      const next = { ...tree };
      const current = next[key] ?? { ...DEFAULT_NODE, locked: index === 0 ? false : true };
      const node: NodeProgress = {
        ...current,
        visited: true,
        locked: false,
        lastVisited: new Date().toISOString(),
      };
      next[key] = node;
      const nextStep = navSteps[index + 1];
      if (nextStep) {
        const nextKey = `${lessonId}:${nextStep.id}`;
        const nextNode = next[nextKey] ?? { ...DEFAULT_NODE, locked: true };
        next[nextKey] = { ...nextNode, locked: false };
      }
      persist(next, { lessonId, stepId, node });
    },
    [lessonId, steps, tree, persist]
  );

  const markCompleted = useCallback(
    (stepId: string, progressPct = 100) => {
      if (!lessonId) return;
      const key = `${lessonId}:${stepId}`;
      const next = { ...tree };
      const current = next[key] ?? DEFAULT_NODE;
      const node: NodeProgress = {
        ...current,
        completed: true,
        visited: true,
        progress: progressPct,
        locked: false,
        lastVisited: new Date().toISOString(),
      };
      next[key] = node;
      persist(next, { lessonId, stepId, node });
    },
    [lessonId, tree, persist]
  );

  const recordStepEvent = useCallback(
    (step: LearnerExperienceStep, event: string): { stepCompleted: boolean; lessonComplete: boolean } => {
      if (!lessonId) return { stepCompleted: false, lessonComplete: false };

      const key = `${lessonId}:${step.id}`;
      const navSteps = navigableSteps(steps);
      const index = navSteps.findIndex((s) => s.id === step.id);
      const next = { ...tree };
      const current = next[key] ?? { ...DEFAULT_NODE, locked: index === 0 ? false : true };

      const satisfies = eventMatchesProgressRule(event, step.progressRule);

      let node: NodeProgress = {
        ...current,
        visited: true,
        locked: false,
        lastVisited: new Date().toISOString(),
      };

      if (satisfies) {
        node = { ...node, completed: true, progress: 100 };
      } else if (event === "view") {
        node = {
          ...node,
          progress: Math.max(node.progress, step.progressRule.requiredForCompletion ? 20 : 100),
          completed: !step.progressRule.requiredForCompletion && step.progressRule.event === "view",
        };
      }

      next[key] = node;

      const nextStep = navSteps[index + 1];
      if (nextStep && (satisfies || event === "view")) {
        const nextKey = `${lessonId}:${nextStep.id}`;
        const nextNode = next[nextKey] ?? { ...DEFAULT_NODE, locked: true };
        next[nextKey] = { ...nextNode, locked: false };
      }

      persist(next, { lessonId, stepId: step.id, node });

      const lessonComplete = isLessonFullyComplete(steps, (sid) => {
        if (sid === step.id) return node;
        return next[`${lessonId}:${sid}`] ?? DEFAULT_NODE;
      });

      return { stepCompleted: satisfies, lessonComplete };
    },
    [lessonId, steps, tree, persist]
  );

  const getUniversePercent = useCallback(
    (lessonIds: string[]) => {
      if (!experience || lessonIds.length === 0) return 0;
      let sum = 0;
      let counted = 0;
      for (const lid of lessonIds) {
        const exp = experience.lessons[lid];
        if (!exp) continue;
        const nav = navigableSteps(exp.steps);
        sum += getLessonProgressPercent(nav, (sid) => tree[`${lid}:${sid}`] ?? DEFAULT_NODE);
        counted++;
      }
      return counted ? Math.round(sum / counted) : 0;
    },
    [experience, tree]
  );

  const addTimeSpent = useCallback(
    (stepId: string, seconds: number) => {
      if (!lessonId || seconds <= 0) return;
      const key = `${lessonId}:${stepId}`;
      const next = { ...tree };
      const current = next[key] ?? DEFAULT_NODE;
      next[key] = { ...current, timeSpent: current.timeSpent + seconds };
      persist(next);
    },
    [lessonId, tree, persist]
  );

  const resumeStepId = useMemo(() => {
    if (!lessonId || steps.length === 0) return null;
    const nav = navigableSteps(steps);
    const sorted = nav
      .map((s) => ({ step: s, prog: getStepProgress(s.id) }))
      .filter(({ prog }) => prog.lastVisited)
      .sort((a, b) => {
        const ta = a.prog.lastVisited ? new Date(a.prog.lastVisited).getTime() : 0;
        const tb = b.prog.lastVisited ? new Date(b.prog.lastVisited).getTime() : 0;
        return tb - ta;
      });
    if (sorted.length > 0) return sorted[0].step.id;
    const firstIncomplete = nav.find((s) => !getStepProgress(s.id).completed);
    return firstIncomplete?.id ?? nav[0]?.id ?? null;
  }, [lessonId, steps, getStepProgress]);

  const lastLessonStepKey = useMemo(() => {
    if (!experience || !lessonId) return null;
    const exp = experience.lessons[lessonId];
    const last = navigableSteps(exp?.steps ?? []).slice(-1)[0];
    return last ? `${lessonId}:${last.id}` : null;
  }, [experience, lessonId]);

  return {
    tree,
    getStepProgress,
    markVisited,
    markCompleted,
    recordStepEvent,
    getUniversePercent,
    addTimeSpent,
    resumeStepId,
    lastLessonStepKey,
    isLessonFullyComplete: () => isLessonFullyComplete(steps, getStepProgress),
  };
}
