import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, FileSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { buildLearnPath } from "@/lib/navigation";
import { AppAssistantFooter } from "@/assistant/AppAssistantFooter";

export function ResearchWorkspacePage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string; stepId?: string }>();
  const { pathname } = useLocation();
  const [title, setTitle] = useState("Research Paper");
  const [abstract, setAbstract] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

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
        <FileSearch className="w-5 h-5 text-emerald-600" />
        <h1 className="font-semibold">Research Workspace</h1>
      </header>
      <div className="flex-1 w-full min-h-0 p-4 sm:p-6 space-y-6">
        <Card className="p-6 space-y-4">
          <div>
            <Label>Paper title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Abstract</Label>
            <Textarea value={abstract} onChange={(e) => setAbstract(e.target.value)} rows={4} className="mt-1" />
          </div>
          <div>
            <Label>Introduction</Label>
            <Textarea value={introduction} onChange={(e) => setIntroduction(e.target.value)} rows={8} className="mt-1" />
          </div>
        </Card>
        <p className="text-xs text-muted-foreground text-center">
          LaTeX compiles internally · PDF preview and submission coming in next iteration
        </p>
      </div>
      <AppAssistantFooter sticky />
    </div>
  );
}
