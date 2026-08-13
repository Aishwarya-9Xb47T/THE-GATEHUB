import { ArrowRight, Code2, FileSearch, Hammer } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { LuExplorerNode } from "@/lib/luAuthoring/types";

const META: Record<string, { label: string; icon: typeof Code2; color: string }> = {
  "coding-lab": { label: "Coding Lab Workspace", icon: Code2, color: "from-violet-500 to-purple-600" },
  notebook: { label: "Notebook Workspace", icon: Code2, color: "from-blue-500 to-cyan-600" },
  project: { label: "Project Workspace", icon: Hammer, color: "from-amber-500 to-orange-600" },
  "research-paper": { label: "Research Workspace", icon: FileSearch, color: "from-emerald-500 to-teal-600" },
};

export function WorkspacePreviewCard({ node }: { node: LuExplorerNode }) {
  const meta = META[node.kind] ?? META.project;
  const Icon = meta.icon;
  const title = String(node.config?.title ?? node.title ?? meta.label);
  const description = String(node.config?.description ?? node.config?.instructions ?? node.config?.abstract ?? "");

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <div className={`bg-gradient-to-r ${meta.color} text-white p-6`}>
        <div className="flex items-center gap-3 mb-2">
          <Icon className="w-7 h-7" />
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-80">{meta.label}</p>
            <h3 className="text-lg font-bold">{title}</h3>
          </div>
        </div>
        {description && <p className="text-sm text-white/85 line-clamp-3">{description.slice(0, 200)}</p>}
      </div>
      <div className="p-4 bg-background flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">GateHub-native workspace · VS Code / Colab / Overleaf style</p>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          Open workspace
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Card>
  );
}
