import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/common/FileUpload";
import {
  Sparkles, Loader2, Code, Binary, Server, Briefcase, Palette, User,
  BookOpen, ChevronDown, ChevronRight, FolderKanban, ArrowLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AuthoringPackage } from "./courseAuthoringTypes";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  price: z.number().min(0),
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().min(1, "Subcategory is required"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  language: z.string().default("en"),
  thumbnail: z.string().optional(),
});
type Form = z.infer<typeof schema>;

const CATEGORIES = [
  { name: "Development", icon: Code, subcategories: ["Web Development", "Mobile Development", "Programming Languages", "Game Development", "Software Engineering", "Database Management"] },
  { name: "Data Science", icon: Binary, subcategories: ["Machine Learning", "Artificial Intelligence", "Data Analysis", "Deep Learning", "Big Data"] },
  { name: "IT & Software", icon: Server, subcategories: ["Network Security", "Cloud Computing", "DevOps", "Operating Systems", "Cybersecurity"] },
  { name: "Business", icon: Briefcase, subcategories: ["Entrepreneurship", "Management", "Finance", "Communication", "Marketing"] },
  { name: "Design", icon: Palette, subcategories: ["Graphic Design", "UX/UI Design", "User Experience Design", "Interior Design", "Web Design"] },
  { name: "Health & Fitness", icon: User, subcategories: ["Fitness", "Yoga", "Nutrition", "Mental Health", "Self Defense"] },
];

interface LocationState {
  authoringPackage?: AuthoringPackage;
  thumbnailUrl?: string;
  branding?: {
    title: string;
    subtitle?: string;
    description?: string;
    categoryId?: string;
    categoryName?: string;
    difficulty?: string;
    bannerUrl?: string;
    thumbnailUrl?: string;
    bannerType?: string;
  };
}

export function CreateCourseManualPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToastStore((s) => s.add);
  const [loading, setLoading] = useState(false);
  const [authoringPackage, setAuthoringPackage] = useState<AuthoringPackage | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]));
  const [courseBranding, setCourseBranding] = useState<LocationState["branding"] | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { price: 0, language: "en" },
  });

  const difficulty = watch("difficulty");
  const language = watch("language");
  const thumbnail = watch("thumbnail");
  const selectedCategoryName = watch("category");
  const subcategory = watch("subcategory");
  const subcategories = CATEGORIES.find((c) => c.name === selectedCategoryName)?.subcategories || [];

  const populateFormFromPackage = (pkg: AuthoringPackage, thumbnailUrl?: string | null) => {
    const d = pkg.courseDetails;
    setValue("title", d.title);
    setValue("subtitle", d.subtitle);
    setValue("description", d.description);
    setValue("price", d.suggestedPrice ?? 0);
    setValue("difficulty", d.difficulty);
    setValue("language", d.language || "en");

    const matchedCategory = CATEGORIES.find(
      (c) => c.name.toLowerCase() === d.category?.toLowerCase()
    )?.name || CATEGORIES[0].name;
    setValue("category", matchedCategory);

    const subs = CATEGORIES.find((c) => c.name === matchedCategory)?.subcategories || [];
    const matchedSub =
      subs.find((s) => s.toLowerCase() === d.subcategory?.toLowerCase()) ||
      subs.find((s) => d.subcategory?.toLowerCase().includes(s.toLowerCase())) ||
      subs[0] ||
      "";
    setValue("subcategory", matchedSub);

    if (thumbnailUrl) setValue("thumbnail", thumbnailUrl);
    setAuthoringPackage(pkg);
    setExpandedModules(new Set([0, 1]));
  };

  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.authoringPackage) {
      populateFormFromPackage(state.authoringPackage, state.thumbnailUrl);
      window.history.replaceState({}, document.title);
    } else if (state?.branding) {
      const b = state.branding;
      setCourseBranding(b);
      setValue("title", b.title);
      setValue("subtitle", b.subtitle || "");
      setValue("description", b.description || b.subtitle || "");
      setValue("difficulty", (b.difficulty?.toLowerCase() as Form["difficulty"]) || "beginner");
      if (b.categoryName) {
        const matched = CATEGORIES.find((c) => c.name.toLowerCase() === b.categoryName?.toLowerCase())?.name;
        if (matched) setValue("category", matched);
      }
      if (b.thumbnailUrl || b.bannerUrl) setValue("thumbnail", b.thumbnailUrl || b.bannerUrl || "");
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setValue]);

  const toggleModule = (idx: number) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const onSubmit = async (data: Form) => {
    setLoading(true);
    try {
      if (authoringPackage) {
        const res = await api<{ course: { id: string } }>("/courses/create-with-authoring", {
          method: "POST",
          body: { ...data, authoringPackage },
        });
        if (res.error) throw new Error(res.error);
        toast({ title: "Course created with full curriculum", variant: "success" });
        navigate(`/instructor/course/${res.data!.course.id}/edit`);
      } else {
        const res = await api<{ course: { id: string } }>("/courses", {
          method: "POST",
          body: {
            ...data,
            categoryId: courseBranding?.categoryId,
            bannerUrl: courseBranding?.bannerUrl || data.thumbnail,
            bannerType: courseBranding?.bannerType,
            thumbnail: data.thumbnail || courseBranding?.thumbnailUrl,
          },
        });
        if (res.error) throw new Error(res.error);
        toast({ title: "Course created", variant: "success" });
        navigate(`/instructor/course/${res.data!.course.id}/edit`);
      }
    } catch (e: any) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const totalLessons = authoringPackage?.curriculum.reduce((n, m) => n + m.lessons.length, 0) ?? 0;
  const totalQuizzes = authoringPackage?.curriculum.filter((m) => m.moduleQuiz).length ?? 0;

  return (
    <div className="w-full min-w-0 space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/instructor/courses/new">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="page-title tracking-tight text-foreground">Manual Creation</h1>
        <p className="mt-2 text-muted-foreground">
          {authoringPackage
            ? "AI has pre-filled your course. Review and edit before creating."
            : "Fill in the basics to get started with your manual curriculum."}
        </p>
      </div>

      {authoringPackage && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI-Generated Curriculum Preview
              <Badge variant="secondary" className="text-[10px]">AI Filled</Badge>
            </CardTitle>
            <CardDescription>
              {authoringPackage.curriculum.length} modules · {totalLessons} lessons · {totalQuizzes} module quizzes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {authoringPackage.curriculum.map((mod, idx) => (
              <div key={idx} className="border rounded-lg bg-background/80">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50"
                  onClick={() => toggleModule(idx)}
                >
                  {expandedModules.has(idx) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <FolderKanban className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm flex-1">{mod.title}</span>
                  <Badge variant="outline" className="text-[10px]">{mod.lessons.length} lessons</Badge>
                </button>
                {expandedModules.has(idx) && (
                  <ul className="px-4 pb-3 space-y-1">
                    {mod.lessons.map((l, li) => (
                      <li key={li} className="text-xs text-muted-foreground flex items-start gap-2">
                        <BookOpen className="w-3 h-3 mt-0.5 shrink-0" />
                        {l.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/40 shadow-xl shadow-black/5">
        <CardHeader>
          <CardTitle>Course Details</CardTitle>
          <CardDescription>Enter your course metadata and create the course shell.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="Course title" {...register("title")} />
              {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Subtitle (optional)</Label>
              <Input placeholder="Brief subtitle" {...register("subtitle")} />
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                placeholder="Describe your course..."
                {...register("description")}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input type="number" step="0.01" min={0} {...register("price", { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={(v) => setValue("difficulty", v as Form["difficulty"])}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={selectedCategoryName}
                  onValueChange={(v) => {
                    setValue("category", v);
                    setValue("subcategory", "");
                  }}
                >
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        <div className="flex items-center gap-3">
                          <c.icon className="w-4 h-4 text-primary" />
                          {c.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Subcategory</Label>
                <Select value={subcategory} onValueChange={(v) => setValue("subcategory", v)} disabled={!selectedCategoryName}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder={selectedCategoryName ? "Select Subcategory" : "First select a category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subcategories.map((sub) => (
                      <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.subcategory && <p className="text-sm text-destructive">{errors.subcategory.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={(v) => setValue("language", v)}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="zh">Chinese</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Course Thumbnail</Label>
              <FileUpload
                value={thumbnail}
                onUploadSuccess={(url) => setValue("thumbnail", url)}
                accept="image/*"
                maxSize={5 * 1024 * 1024}
              />
            </div>

            <Button type="submit" className="w-full h-14 text-lg font-semibold rounded-xl shadow-lg" disabled={loading}>
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin mr-2" />Creating Course...</>
              ) : authoringPackage ? (
                <><Sparkles className="w-5 h-5 mr-2" />Create Course with Full Curriculum</>
              ) : (
                "Create Course"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
