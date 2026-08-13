import type { ProjectTemplateOption } from "../types";

export const PROJECT_TEMPLATE_OPTIONS: ProjectTemplateOption[] = [
  {
    id: "blank",
    label: "Blank Project",
    description: "Start from an empty main.tex",
  },
  {
    id: "course",
    label: "Course Template",
    description: "Lecture notes with sections and image placeholders",
  },
  {
    id: "learning-universe",
    label: "Learning Universe Template",
    description: "Full DSL for tracks, modules, quizzes, and checkpoints",
  },
  {
    id: "academic",
    label: "Academic Template",
    description: "Multi-chapter article with \\input chapters",
  },
  {
    id: "assignment",
    label: "Assignment Template",
    description: "Problem sets with practice and assignment blocks",
  },
];
