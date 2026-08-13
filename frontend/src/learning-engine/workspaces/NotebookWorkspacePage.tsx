import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { buildLearnPath } from "@/lib/navigation";
import { AppAssistantFooter } from "@/assistant/AppAssistantFooter";

export function NotebookWorkspacePage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string; stepId?: string }>();
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(true);
  const [markdown, setMarkdown] = useState("# Notebook\n\nWrite your analysis here.\n");

  useEffect(() => {
    setLoading(false);
  }, [id, lessonId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b flex items-center gap-3 px-4">
        <Button asChild size="icon" variant="ghost">
          <Link to={buildLearnPath({ pathname, universeId: id!, lessonId })}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <BookOpen className="w-5 h-5 text-blue-600" />
        <h1 className="font-semibold">Notebook Workspace</h1>
      </header>
      <div className="flex-1 w-full min-h-0 p-4 sm:p-6 md:p-8 space-y-4">
        <Card className="p-4">
          <Textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={16} className="font-mono text-sm border-0 shadow-none focus-visible:ring-0" />
        </Card>
        <p className="text-xs text-muted-foreground text-center">
          Interactive notebook · OAuth provider integration coming soon
        </p>
      </div>
      <AppAssistantFooter sticky />
    </div>
  );
}
