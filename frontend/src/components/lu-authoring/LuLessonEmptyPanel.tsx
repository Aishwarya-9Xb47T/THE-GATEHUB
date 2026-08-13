interface LuLessonEmptyPanelProps {
  lessonTitle?: string;
  onAddOverview?: () => void;
}

export function LuLessonEmptyPanel({ lessonTitle, onAddOverview }: LuLessonEmptyPanelProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
      <div className="max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">
          {lessonTitle ? `Build: ${lessonTitle}` : "Build your lesson"}
        </h2>
        <p className="text-sm">
          Add educational components from the explorer — Overview, Topics, Practice, Coding Lab, Quiz, Project, and more.
        </p>
        {onAddOverview && (
          <button
            type="button"
            onClick={onAddOverview}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2"
          >
            Start with Overview
          </button>
        )}
        <p className="text-xs text-slate-500">
          Learning Mode keeps everything visual. Switch to Developer Mode only when you need raw LaTeX or project files.
        </p>
      </div>
    </div>
  );
}
