import type { LearnerExperienceStep } from "../types";
import { HeroSection } from "./HeroSection";
import { LessonDocumentReader } from "./LessonDocumentReader";
import { MediaSection } from "./MediaSection";
import { PracticeExperience } from "./PracticeExperience";
import { QuizAssessment } from "./QuizAssessment";
import { WorkspaceEntryCard } from "./WorkspaceEntryCard";
import { isWorkspaceStepKind } from "../workspaces/types";
import { DownloadCenter } from "./DownloadCenter";
import { ReflectionJournal } from "./ReflectionJournal";
import { DiscussionPanel } from "./DiscussionPanel";
import { NextLessonCta } from "./NextLessonCta";
import { AssignmentPanel } from "./AssignmentPanel";

export interface ExperienceRendererProps {
  step: LearnerExperienceStep;
  universeId: string;
  lessonId: string;
  publishVersionId?: string;
  assets?: { filename: string; storedFilename: string }[];
  onProgress: (stepId: string, event: string) => void;
  onNavigateLesson?: (lessonId: string) => void;
  onOpenWorkspace?: (stepId: string) => void;
  workspaceMode?: boolean;
  lessonComplete?: boolean;
}

export function ExperienceRenderer(props: ExperienceRendererProps) {
  console.log("EXPERIENCE RENDERER RENDERED");
  console.log("Step Kind:", props.step.kind);
  console.log("Lesson ID:", props.lessonId);
  console.log("Universe ID:", props.universeId);
  console.log("Publish Version ID:", props.publishVersionId);

  const { step, onOpenWorkspace } = props;

  if (isWorkspaceStepKind(step.kind) && !props.workspaceMode) {
    return <WorkspaceEntryCard step={step} onOpen={() => onOpenWorkspace?.(step.id)} />;
  }

  switch (step.kind) {
    case "hero":
      return <HeroSection {...props} />;
    case "overview":
    case "objectives":
    case "theory":
    case "interactive-demo":
      return <LessonDocumentReader {...props} />;
    case "image":
    case "video":
    case "code-example":
      return <MediaSection {...props} />;
    case "practice":
      return <PracticeExperience {...props} />;
    case "quiz":
      return <QuizAssessment {...props} />;
    case "project":
      return <WorkspaceEntryCard step={step} onOpen={() => onOpenWorkspace?.(step.id)} />;
    case "coding-lab":
    case "notebook":
    case "research":
      return null;
    case "assignment":
      return <AssignmentPanel {...props} />;
    case "discussion":
      return <DiscussionPanel {...props} />;
    case "downloads":
      return <DownloadCenter {...props} />;
    case "reflection":
      return <ReflectionJournal {...props} />;
    case "summary":
      return <LessonDocumentReader {...props} />;
    case "next-lesson":
      return <NextLessonCta {...props} />;
    default:
      return null;
  }
}
