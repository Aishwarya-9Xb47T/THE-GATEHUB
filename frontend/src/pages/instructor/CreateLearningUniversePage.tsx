import React from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, GraduationCap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateWithAICard, buildAIArchitectPath } from "@/components/authoring/GenerateWithAICard";
import { PRODUCT_TYPES } from "@/lib/productTypes";

export function CreateLearningUniversePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <div className="border-b border-border">
        <div className="w-full max-w-5xl mx-auto flex items-center gap-4 px-6 py-6 md:px-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/instructor")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Learning Universe</h1>
            <p className="text-sm text-muted-foreground">Choose your preferred authoring experience</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-8 md:px-8">
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          {/* Academic Authoring Studio */}
          <Card className="h-full hover:border-primary/50 transition-all duration-300 cursor-pointer group">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <CardTitle>Academic Authoring Studio</CardTitle>
              </div>
              <CardDescription>
                Overleaf-inspired experience for mathematics, machine learning, and technical content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Full LaTeX editor with syntax highlighting
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Live PDF preview
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Perfect for equations, proofs, and technical documents
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Same Learning Universe hierarchy
                </li>
              </ul>
              <Button
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-600 mt-4"
                onClick={() =>
                  navigate("/instructor/learning-universe/new/branding?studio=academic&productType=learning-universe")
                }
              >
                Choose Academic Studio
              </Button>
            </CardContent>
          </Card>

          {/* Visual Authoring Studio */}
          <Card className="h-full hover:border-primary/50 transition-all duration-300 cursor-pointer group">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <CardTitle>Visual Authoring Studio</CardTitle>
              </div>
              <CardDescription>
                Notion-inspired visual builder for general courses and content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Drag and drop hierarchy builder
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Visual roadmap view
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Clean, intuitive interface
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Perfect for general education courses
                </li>
              </ul>
              <Button
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 mt-4"
                onClick={() => navigate("/instructor/learning-universe/new/branding?studio=visual")}
              >
                Choose Visual Studio
              </Button>
            </CardContent>
          </Card>

          <GenerateWithAICard
            productType={PRODUCT_TYPES.LEARNING_UNIVERSE}
            onChoose={() => navigate(buildAIArchitectPath(PRODUCT_TYPES.LEARNING_UNIVERSE))}
          />
        </div>
      </div>
    </div>
  );
}
