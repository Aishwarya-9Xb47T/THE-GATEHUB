import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveLearningUniverseAsset } from "@/lib/resolveLearningUniverseAsset";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

export function DownloadCenter({ step, universeId, assets }: ExperienceRendererProps) {
  const items = (step.payload.items as Array<{ id: string; title: string; url: string; type: string; downloadable?: boolean }>) ?? [];

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Download className="w-5 h-5" />
        {step.title}
      </h2>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No downloads for this lesson.</p>}
        {items.map((item) => {
          const resolved = resolveLearningUniverseAsset(item.url, universeId, assets).resolvedUrl;
          return (
            <div key={item.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-muted/30">
              <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground uppercase">{item.type}</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href={resolved} target="_blank" rel="noopener noreferrer" download>
                  Download
                </a>
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
