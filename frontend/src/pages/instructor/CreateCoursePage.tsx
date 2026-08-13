import { useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutGrid, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateWithAICard, buildAIArchitectPath } from "@/components/authoring/GenerateWithAICard";
import { PRODUCT_TYPES } from "@/lib/productTypes";

export function CreateCoursePage() {
  const navigate = useNavigate();
  const premiumBranding = (studio: "visual" | "academic") =>
    `/instructor/courses/new/branding?studio=${studio}&productType=${PRODUCT_TYPES.PREMIUM_COURSE}`;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <div className="border-b border-border">
        <div className="w-full max-w-6xl mx-auto flex items-center gap-4 px-6 py-6 md:px-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/instructor/courses")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Premium Course</h1>
            <p className="text-sm text-muted-foreground">
              Set your price and branding, then build content in your preferred studio
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-8 md:px-8">
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          <Card className="h-full hover:border-primary/50 transition-all duration-300 group">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl">
                  <LayoutGrid className="w-6 h-6 text-white" />
                </div>
                <CardTitle>AI Visual Studio</CardTitle>
              </div>
              <CardDescription>
                Drag-and-drop tracks, modules, and lessons with live student preview
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {[
                  "Visual curriculum builder",
                  "Block-based lesson editor",
                  "Set your price before publishing",
                  "Students enroll and pay from the course catalog",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button className="w-full mt-4" onClick={() => navigate(premiumBranding("visual"))}>
                Choose Visual Studio
              </Button>
            </CardContent>
          </Card>

          <Card className="h-full hover:border-primary/50 transition-all duration-300 group">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl">
                  <FileCode2 className="w-6 h-6 text-white" />
                </div>
                <CardTitle>LaTeX Editor</CardTitle>
              </div>
              <CardDescription>
                Academic Authoring Studio — structured DSL, compile, and publish to catalog
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {[
                  "Monaco editor with live preview",
                  "track / module / lesson DSL structure",
                  "Your price syncs to the student checkout",
                  "Full enrollment and payment flow",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-600 mt-4"
                onClick={() => navigate(premiumBranding("academic"))}
              >
                Choose LaTeX Editor
              </Button>
            </CardContent>
          </Card>

          <GenerateWithAICard
            productType={PRODUCT_TYPES.PREMIUM_COURSE}
            onChoose={() => navigate(buildAIArchitectPath(PRODUCT_TYPES.PREMIUM_COURSE))}
          />
        </div>
      </div>
    </div>
  );
}
