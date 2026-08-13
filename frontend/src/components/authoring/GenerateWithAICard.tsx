import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductType } from "@/lib/productTypes";

interface GenerateWithAICardProps {
  productType: ProductType;
  onChoose: () => void;
}

export function GenerateWithAICard({ onChoose }: GenerateWithAICardProps) {
  return (
    <Card className="h-full hover:border-primary/50 transition-all duration-300 group border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-gradient-to-br from-primary to-violet-600 rounded-xl">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <CardTitle>Generate with AI</CardTitle>
        </div>
        <CardDescription>
          AI Course Architect — interview, research, curriculum design, and LaTeX generation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {[
            "Interactive curriculum discovery interview",
            "Real research & optimized blueprint",
            "Production-ready LaTeX lessons",
            "Quizzes, labs, projects & quality review",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              {item}
            </li>
          ))}
        </ul>
        <Button
          className="w-full bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90 mt-4"
          onClick={onChoose}
        >
          Choose AI Architect
        </Button>
      </CardContent>
    </Card>
  );
}

export function buildAIArchitectPath(productType: ProductType): string {
  return `/instructor/ai-architect?productType=${productType}`;
}
