export function LuSelectComponentPanel() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
      <div className="max-w-md space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">Select a lesson component</h2>
        <p className="text-sm">
          Choose Overview, Topics, Practice, Quiz, Project, or another item from the explorer to start editing.
        </p>
      </div>
    </div>
  );
}
