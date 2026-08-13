import { useState } from "react";
import { Sparkles } from "lucide-react";
import { generateAIQuestions } from "@/lib/assessmentStudio/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToastStore } from "@/store/toastStore";

export function AiStudioPanel() {
  const toast = useToastStore((s) => s.add);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [bloomLevel, setBloomLevel] = useState("L2");
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    const res = await generateAIQuestions({ topic, difficulty, bloomLevel, count });
    setLoading(false);
    if (res.error) return toast({ title: "Generation failed", description: res.error, variant: "destructive" });
    toast({
      title: `Generated ${res.data?.data.length} draft questions`,
      description: "They require review before publishing. Find them in Question Bank → AI Generated.",
      variant: "success",
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Generate draft questions with AI. Saved to your Question Bank for review before publishing.
      </p>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Question Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Topic</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Binary Search Trees" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Bloom</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={bloomLevel}
                onChange={(e) => setBloomLevel(e.target.value)}
              >
                {["L1", "L2", "L3", "L4", "L5", "L6"].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Count</Label>
              <Input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? "Generating…" : "Generate Questions"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
