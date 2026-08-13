import { BookOpen, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LuExplorerNode } from "@/lib/luAuthoring/types";

interface StudioPickLessonProps {
  lessons: Array<{ node: LuExplorerNode; moduleTitle: string; trackTitle: string }>;
  onSelect: (node: LuExplorerNode) => void;
}

export function StudioPickLesson({ lessons, onSelect }: StudioPickLessonProps) {
  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-muted/20 p-8">
      <div className="max-w-xl mx-auto text-center mb-8">
        <h2 className="text-xl font-semibold mb-2">Choose a lesson to edit</h2>
        <p className="text-sm text-muted-foreground">Select a lesson from your course outline, or pick one below.</p>
      </div>
      <div className="max-w-lg mx-auto space-y-2">
        {lessons.map(({ node, moduleTitle }) => (
          <Card
            key={node.id}
            className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
            onClick={() => onSelect(node)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <p className="font-medium truncate">{node.title}</p>
                <p className="text-xs text-muted-foreground">{moduleTitle}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function collectAllLessons(nodes: LuExplorerNode[]): Array<{ node: LuExplorerNode; moduleTitle: string; trackTitle: string }> {
  const result: Array<{ node: LuExplorerNode; moduleTitle: string; trackTitle: string }> = [];
  const universe = nodes[0];
  if (!universe?.children) return result;
  for (const track of universe.children) {
    if (track.kind !== "track") continue;
    for (const mod of track.children ?? []) {
      if (mod.kind !== "module") continue;
      for (const lesson of mod.children ?? []) {
        if (lesson.kind === "lesson") {
          result.push({ node: lesson, moduleTitle: mod.title, trackTitle: track.title });
        }
      }
    }
  }
  return result;
}

export function findFirstLesson(nodes: LuExplorerNode[]): LuExplorerNode | null {
  const all = collectAllLessons(nodes);
  return all[0]?.node ?? null;
}
