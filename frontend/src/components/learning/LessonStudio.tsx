import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Type, FileText } from "lucide-react";

interface LessonStudioProps {
  lessonId?: string;
  title?: string;
  mode?: "academic" | "visual";
  onSave?: () => void;
}

export function LessonStudio({ }: LessonStudioProps) {
  return (
    <div>
      <Tabs defaultValue="visual">
        <TabsList className="mb-6">
          <TabsTrigger value="visual" className="gap-2">
            <Type className="w-4 h-4" />
            Visual Editor
          </TabsTrigger>
          <TabsTrigger value="latex" className="gap-2">
            <FileText className="w-4 h-4" />
            LaTeX Studio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual">
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">Visual Editor</h3>
            <p>Visual editor content here</p>
          </div>
        </TabsContent>

        <TabsContent value="latex">
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">LaTeX Editor</h3>
            <p>LaTeX editor content here</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
