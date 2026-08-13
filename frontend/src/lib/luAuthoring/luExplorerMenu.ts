import type { LuExplorerNode, StructureAction, LuLessonComponentKind } from "./types";
import type { LessonSection } from "./lessonSections";
import type { WizardType } from "@/components/lu-authoring/LuWizardDialog";
import { COMPONENT_MENU_ITEMS } from "./componentRegistry";
import { LU_QUESTION_TYPES, QUESTION_TYPE_LABELS } from "./quizTypes";

export { LU_QUESTION_TYPES, QUESTION_TYPE_LABELS };

export interface LuMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  separator?: boolean;
}

export interface LuMenuHandlers {
  onWizard: (type: WizardType, node?: LuExplorerNode) => void;
  onAction: (action: StructureAction) => Promise<void> | void;
  onOpenFile: (path: string) => void;
  onOpenComponent: (node: LuExplorerNode) => void;
  onAddComponent: (node: LuExplorerNode, section: LessonSection) => Promise<void> | void;
  onRename: (node: LuExplorerNode) => void;
  onProperties: (node: LuExplorerNode) => void;
  onImportTrack: () => void;
}

const LESSON_COMPONENTS = COMPONENT_MENU_ITEMS.map((c) => ({
  id: `add-${c.block}`,
  label: c.label,
  section: c.section as LessonSection,
  block: c.block,
}));

const QUIZ_QUESTION_TYPES = LU_QUESTION_TYPES.map((type) => ({
  id: `q-${type}`,
  label: QUESTION_TYPE_LABELS[type],
  type,
}));

const RESOURCE_TYPES = [
  { id: "res-pdf", label: "PDF", type: "pdf" },
  { id: "res-video", label: "Video", type: "video" },
  { id: "res-image", label: "Image", type: "image" },
  { id: "res-dataset", label: "Dataset", type: "dataset" },
  { id: "res-link", label: "External Link", type: "link" },
  { id: "res-ref", label: "Reference", type: "reference" },
];

const COMPONENT_KINDS = new Set(LESSON_COMPONENTS.map((c) => c.block));

function componentMenuExtras(node: LuExplorerNode): LuMenuItem[] {
  if (!node.componentId || !node.trackId || !node.moduleId || !node.lessonId) return [];
  if (node.kind === "question" || node.kind === "resource-item") return [];
  return [
    { id: "sep-move", label: "", separator: true },
    { id: "move-up", label: "Move Up" },
    { id: "move-down", label: "Move Down" },
    { id: "duplicate-component", label: "Duplicate" },
  ];
}

function existingKinds(node: LuExplorerNode): Set<string> {
  return new Set((node.children ?? []).map((c) => c.kind));
}

/** Menu item id used by executeMenuItem for inline explorer delete buttons. */
export function explorerDeleteMenuId(node: LuExplorerNode): "delete" | "delete-component" | null {
  if (node.kind === "universe") return null;
  if (node.kind === "track" || node.kind === "module" || node.kind === "lesson") return "delete";
  if (node.trackId && node.moduleId && node.lessonId && node.componentId) return "delete-component";
  return null;
}

export function canDeleteExplorerNode(node: LuExplorerNode): boolean {
  return explorerDeleteMenuId(node) !== null;
}

export function getContextMenuItems(node: LuExplorerNode): LuMenuItem[] {
  if (node.kind === "universe") {
    return [
      { id: "new-track", label: "New Track" },
      { id: "import-track", label: "Import Track" },
      { id: "sep1", label: "", separator: true },
      { id: "properties", label: "Properties" },
    ];
  }

  if (node.kind === "track") {
    return [
      { id: "new-module", label: "New Module" },
      { id: "sep1", label: "", separator: true },
      { id: "rename", label: "Rename Track" },
      { id: "duplicate", label: "Duplicate Track" },
      { id: "move-up", label: "Move Up" },
      { id: "move-down", label: "Move Down" },
      { id: "sep2", label: "", separator: true },
      { id: "properties", label: "Properties" },
      { id: "delete", label: "Delete Track", danger: true },
    ];
  }

  if (node.kind === "module") {
    return [
      { id: "new-lesson", label: "New Lesson" },
      { id: "sep1", label: "", separator: true },
      { id: "rename", label: "Rename Module" },
      { id: "duplicate", label: "Duplicate Module" },
      { id: "move-up", label: "Move Up" },
      { id: "move-down", label: "Move Down" },
      { id: "sep2", label: "", separator: true },
      { id: "properties", label: "Properties" },
      { id: "delete", label: "Delete Module", danger: true },
    ];
  }

  if (node.kind === "lesson") {
    const existing = existingKinds(node);
    const items: LuMenuItem[] = [];
    for (const comp of LESSON_COMPONENTS) {
      if (comp.block === "overview" && existing.has("overview")) {
        items.push({ id: "open-overview", label: "Open Overview" });
      } else {
        items.push({ id: comp.id, label: `Add ${comp.label}` });
      }
    }
    items.push(
      { id: "sep1", label: "", separator: true },
      { id: "preview", label: "Preview Lesson" },
      { id: "duplicate", label: "Duplicate Lesson" },
      { id: "rename", label: "Rename Lesson" },
      { id: "delete", label: "Delete Lesson", danger: true }
    );
    return items;
  }

  if (node.kind === "quiz") {
    return [
      { id: "open-component", label: `Open ${node.title}` },
      { id: "add-question", label: "Add Question" },
      { id: "sep1", label: "", separator: true },
      { id: "rename", label: "Rename Quiz" },
      { id: "duplicate-component", label: "Duplicate Quiz" },
      { id: "move-up", label: "Move Up" },
      { id: "move-down", label: "Move Down" },
      { id: "preview-quiz", label: "Preview Quiz" },
      { id: "sep2", label: "", separator: true },
      { id: "delete-component", label: "Delete Quiz", danger: true },
    ];
  }

  if (node.kind === "resources") {
    return [
      { id: "open-component", label: `Open ${node.title}` },
      ...RESOURCE_TYPES.map((r) => ({ id: r.id, label: r.label })),
      { id: "sep1", label: "", separator: true },
      { id: "rename", label: "Rename Resources" },
      ...componentMenuExtras(node),
      { id: "sep2", label: "", separator: true },
      { id: "delete-component", label: "Remove Resources", danger: true },
    ];
  }

  if (COMPONENT_KINDS.has(node.kind as LuLessonComponentKind)) {
    return [
      { id: "open-component", label: `Open ${node.title}` },
      { id: "rename", label: `Rename ${node.title}` },
      ...componentMenuExtras(node),
      { id: "sep1", label: "", separator: true },
      { id: "delete-component", label: `Remove ${node.title}`, danger: true },
    ];
  }

  if (node.kind === "question" || node.kind === "resource-item") {
    const items: LuMenuItem[] = [
      { id: "open-component", label: "Open" },
      { id: "rename", label: "Rename" },
    ];
    if (node.kind === "question") {
      items.push(
        { id: "duplicate-question", label: "Duplicate" },
        { id: "move-up", label: "Move Up" },
        { id: "move-down", label: "Move Down" }
      );
    }
    items.push(
      { id: "sep1", label: "", separator: true },
      { id: "delete-component", label: "Delete", danger: true }
    );
    return items;
  }

  return [];
}

export function getAddMenuItems(selected: LuExplorerNode | null): LuMenuItem[] {
  if (!selected || selected.kind === "universe") {
    return [{ id: "new-track", label: "New Track" }];
  }
  if (selected.kind === "track") {
    return [{ id: "new-module", label: "New Module" }];
  }
  if (selected.kind === "module") {
    return [{ id: "new-lesson", label: "New Lesson" }];
  }
  if (selected.kind === "lesson") {
    const existing = existingKinds(selected);
    return LESSON_COMPONENTS.filter((c) => !(c.block === "overview" && existing.has("overview"))).map((c) => ({
      id: c.id,
      label: c.label,
    }));
  }
  if (selected.kind === "quiz") {
    return [{ id: "add-question", label: "Add Question" }];
  }
  if (selected.kind === "resources") {
    return RESOURCE_TYPES.map((r) => ({ id: r.id, label: r.label }));
  }
  return [];
}

function appendBlock(h: LuMenuHandlers, node: LuExplorerNode, block: string) {
  const comp = LESSON_COMPONENTS.find((c) => c.block === block);
  if (comp) void h.onAddComponent(node, comp.section);
}

export function executeMenuItem(itemId: string, node: LuExplorerNode, h: LuMenuHandlers): void {
  switch (itemId) {
    case "new-track":
      h.onWizard("track", node);
      break;
    case "import-track":
      h.onImportTrack();
      break;
    case "new-module":
      h.onWizard("module", node);
      break;
    case "new-lesson":
      h.onWizard("lesson", node);
      break;
    case "rename":
      if (node.kind === "track" || node.kind === "module" || node.kind === "lesson" || node.componentId) {
        h.onRename(node);
      }
      break;
    case "properties":
      h.onProperties(node);
      break;
    case "duplicate":
      if (node.kind === "track") h.onAction({ action: "duplicateTrack", trackId: node.trackId! });
      else if (node.kind === "module") h.onAction({ action: "duplicateModule", trackId: node.trackId!, moduleId: node.moduleId! });
      else if (node.kind === "lesson") h.onAction({ action: "duplicateLesson", trackId: node.trackId!, moduleId: node.moduleId!, lessonId: node.lessonId! });
      break;
    case "duplicate-component":
      if (node.componentId) {
        void h.onAction({
          action: "duplicateComponent",
          trackId: node.trackId!,
          moduleId: node.moduleId!,
          lessonId: node.lessonId!,
          componentId: node.componentId,
        });
      }
      break;
    case "move-up":
      if (node.kind === "question" && node.componentId && node.config?.parentId) {
        void h.onAction({
          action: "moveQuizQuestion",
          trackId: node.trackId!,
          moduleId: node.moduleId!,
          lessonId: node.lessonId!,
          quizId: String(node.config.parentId),
          questionId: node.componentId,
          direction: "up",
        });
        break;
      }
      if (node.componentId) {
        void h.onAction({
          action: "moveComponent",
          trackId: node.trackId!,
          moduleId: node.moduleId!,
          lessonId: node.lessonId!,
          componentId: node.componentId,
          direction: "up",
        });
      } else if (node.kind === "track") h.onAction({ action: "moveTrack", trackId: node.trackId!, direction: "up" });
      else if (node.kind === "module") h.onAction({ action: "moveModule", trackId: node.trackId!, moduleId: node.moduleId!, direction: "up" });
      else if (node.kind === "lesson") h.onAction({ action: "moveLesson", trackId: node.trackId!, moduleId: node.moduleId!, lessonId: node.lessonId!, direction: "up" });
      break;
    case "move-down":
      if (node.kind === "question" && node.componentId && node.config?.parentId) {
        void h.onAction({
          action: "moveQuizQuestion",
          trackId: node.trackId!,
          moduleId: node.moduleId!,
          lessonId: node.lessonId!,
          quizId: String(node.config.parentId),
          questionId: node.componentId,
          direction: "down",
        });
        break;
      }
      if (node.componentId) {
        void h.onAction({
          action: "moveComponent",
          trackId: node.trackId!,
          moduleId: node.moduleId!,
          lessonId: node.lessonId!,
          componentId: node.componentId,
          direction: "down",
        });
      } else if (node.kind === "track") h.onAction({ action: "moveTrack", trackId: node.trackId!, direction: "down" });
      else if (node.kind === "module") h.onAction({ action: "moveModule", trackId: node.trackId!, moduleId: node.moduleId!, direction: "down" });
      else if (node.kind === "lesson") h.onAction({ action: "moveLesson", trackId: node.trackId!, moduleId: node.moduleId!, lessonId: node.lessonId!, direction: "down" });
      break;
    case "delete":
      if (node.kind === "track" && confirm("Delete this track and all content?")) h.onAction({ action: "deleteTrack", trackId: node.trackId! });
      else if (node.kind === "module" && confirm("Delete this module and all lessons?")) h.onAction({ action: "deleteModule", trackId: node.trackId!, moduleId: node.moduleId! });
      else if (node.kind === "lesson" && confirm("Delete this lesson?")) h.onAction({ action: "deleteLesson", trackId: node.trackId!, moduleId: node.moduleId!, lessonId: node.lessonId! });
      break;
    case "preview":
      if (node.filePath) window.dispatchEvent(new CustomEvent("lu-preview-lesson", { detail: node.filePath }));
      break;
    case "preview-quiz":
      if (node.kind === "quiz") {
        window.dispatchEvent(new CustomEvent("lu-preview-quiz", { detail: node }));
      }
      break;
    case "add-question":
      if (node.kind === "quiz" && node.componentId) {
        h.onOpenComponent(node);
        window.dispatchEvent(new CustomEvent("lu-quiz-add-question", { detail: node }));
      }
      break;
    case "open-lesson":
    case "open-component":
      h.onOpenComponent(node);
      break;
    case "duplicate-question":
      if (node.kind === "question" && node.componentId && node.config?.parentId) {
        void h.onAction({
          action: "duplicateQuizQuestion",
          trackId: node.trackId!,
          moduleId: node.moduleId!,
          lessonId: node.lessonId!,
          quizId: String(node.config.parentId),
          questionId: node.componentId,
        });
      }
      break;
    case "delete-component":
      if (confirm(`Remove "${node.title}"?`) && node.trackId && node.moduleId && node.lessonId && node.componentId) {
        h.onAction({
          action: "removeLessonComponent",
          trackId: node.trackId,
          moduleId: node.moduleId,
          lessonId: node.lessonId,
          componentId: node.componentId,
        });
      }
      break;
    default:
      if (itemId.startsWith("open-")) {
        const comp = LESSON_COMPONENTS.find((c) => c.id === itemId.replace("open-", "add-"));
        if (comp && node.kind === "lesson") {
          const child = node.children?.find((c) => c.kind === comp.block);
          if (child) h.onOpenComponent(child);
        }
      } else if (itemId.startsWith("add-")) {
        const comp = LESSON_COMPONENTS.find((c) => c.id === itemId);
        if (comp && node.kind === "lesson") {
          if (comp.block === "video") {
            window.dispatchEvent(new CustomEvent("lu-add-video-content", { detail: node }));
          } else {
            appendBlock(h, node, comp.block);
          }
        }
      } else if (itemId === "add-question") {
        if (node.kind === "quiz" && node.componentId) {
          h.onOpenComponent(node);
          window.dispatchEvent(new CustomEvent("lu-quiz-add-question", { detail: node }));
        }
      } else if (RESOURCE_TYPES.some((r) => r.id === itemId)) {
        const r = RESOURCE_TYPES.find((x) => x.id === itemId)!;
        void h.onAction({
          action: "addResourceItem",
          trackId: node.trackId!,
          moduleId: node.moduleId!,
          lessonId: node.lessonId!,
          resourcesComponentId: node.kind === "resources" ? node.componentId : undefined,
          resourceType: r.type,
          title: r.label,
        });
      }
      break;
  }
}
