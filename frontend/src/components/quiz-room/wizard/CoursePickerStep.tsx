import { useMemo, useState } from "react";
import { Search, Users, BookOpen, ChevronRight, GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolveCourseBannerUrl } from "@/lib/courseBanner";
import type { InstructorCourseCard } from "./wizardTypes";

interface CoursePickerStepProps {
  courses: InstructorCourseCard[];
  selectedId: string;
  onSelect: (course: InstructorCourseCard) => void;
  loading?: boolean;
}

function productLabel(type?: string) {
  if (!type) return "Course";
  if (type.includes("premium")) return "Premium Course";
  if (type.includes("free")) return "Free Learning";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CoursePickerStep({ courses, selectedId, onSelect, loading }: CoursePickerStepProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, search]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Choose a course</h2>
        <p className="mt-1 text-white/60">Select the course your quiz room will be linked to.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search courses…"
          className="h-12 border-white/10 bg-white/5 pl-11 text-white placeholder:text-white/40 backdrop-blur-sm"
        />
      </div>

      {loading ? (
        <p className="text-center text-white/50">Loading your courses…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 py-16 text-center text-white/50">
          No courses found. Create a course first, then return here.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((course) => {
            const selected = course.id === selectedId;
            const modules = course._count?.sections ?? 0;
            const students = course._count?.enrollments ?? 0;

            return (
              <button
                key={course.id}
                type="button"
                onClick={() => onSelect(course)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200",
                  selected
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-amber-500/20">
                    {course.thumbnail ? (
                      <img
                        src={resolveCourseBannerUrl(course.thumbnail) || course.thumbnail}
                        alt=""
                        className="h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <GraduationCap className="h-7 w-7 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Badge variant="secondary" className="mb-2 bg-white/10 text-[10px] text-white/80">
                      {productLabel(course.productType)}
                    </Badge>
                    <h3 className="font-semibold leading-snug text-white">{course.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/50">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5" />
                        {modules} modules
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {students} students
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-5 w-5 shrink-0 transition-transform",
                      selected ? "text-primary" : "text-white/30 group-hover:translate-x-0.5 group-hover:text-white/60"
                    )}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
