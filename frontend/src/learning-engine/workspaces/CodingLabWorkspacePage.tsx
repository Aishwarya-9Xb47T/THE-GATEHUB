import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, Code2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { buildLearnPath } from "@/lib/navigation";
import { AppAssistantFooter } from "@/assistant/AppAssistantFooter";
import { TryItPlayground } from "@/components/learning/TryItPlayground";

export function CodingLabWorkspacePage() {
  const { id, lessonId, stepId } = useParams<{ id: string; lessonId: string; stepId: string }>();
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("python");
  const [starterCode, setStarterCode] = useState("# Write your solution here\n");
  const [expectedOutput, setExpectedOutput] = useState("");

  useEffect(() => {
    if (!id) return;
    void api(`/learning-universes/${id}/experience`).then((res) => {
      const data = res.data as {
        data?: { lessons?: Record<string, { steps: Array<{ id: string; payload: Record<string, unknown> }> }> };
      };
      const lesson = data?.data?.lessons?.[lessonId ?? ""];
      const step = lesson?.steps.find((s) => s.id === stepId);
      if (step?.payload) {
        setLanguage(String(step.payload.language ?? "python"));
        setStarterCode(String(step.payload.starterCode ?? step.payload.initialCode ?? "# Write your solution here\n"));
        setExpectedOutput(String(step.payload.expectedOutput ?? ""));
      }
      setLoading(false);
    });
  }, [id, lessonId, stepId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="h-14 border-b border-slate-800 flex items-center gap-3 px-4">
        <Button asChild size="icon" variant="ghost" className="text-slate-300">
          <Link to={buildLearnPath({ pathname, universeId: id!, lessonId })}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <Code2 className="w-5 h-5 text-violet-400" />
        <h1 className="font-semibold">Coding Lab</h1>
      </header>
      <div className="flex-1 p-4 w-full min-h-0">
        <Card className="bg-slate-900 border-slate-800 overflow-hidden">
          <TryItPlayground language={language} initialCode={starterCode} expectedOutput={expectedOutput} />
        </Card>
      </div>
      <AppAssistantFooter sticky className="border-t border-slate-800 bg-slate-950" innerClassName="px-4" />
    </div>
  );
}
