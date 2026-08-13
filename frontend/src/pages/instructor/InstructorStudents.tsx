import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, GraduationCap, Calendar, Search, Star, BookOpen, Users as UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

interface Student {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  enrolledAt: string;
  progress: number;
  isCompleted?: boolean;
  completedLessons?: number | null;
  totalLessons?: number | null;
  lastAccessed?: string | null;
  hasCertificate?: boolean;
}

interface CourseGroup {
  courseTitle: string;
  courseId?: string;
  courseThumbnail?: string | null;
  courseStatus?: string;
  courseRating?: number;
  courseReviewCount?: number;
  students: Student[];
}

export function InstructorStudents() {
  const [searchTerm, setSearchTerm] = useState("");
  const location = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["instructor", "students"],
    queryFn: async () => {
      const res = await api<{ courses: CourseGroup[] }>("/enrollments/instructor/students");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const courseGroups = data?.courses ?? [];

  useEffect(() => {
    const hash = location.hash?.replace(/^#/, "");
    if (!hash?.startsWith("course-")) return;
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash, courseGroups.length]);

  const filteredGroups = courseGroups.map(group => ({
    ...group,
    students: group.students.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.courseTitle.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(group => group.students.length > 0);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <Users className="w-10 h-10 text-primary" />
            Students
          </h1>
          <p className="mt-1 text-muted-foreground">Manage and track students enrolled in your courses</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search students or courses..." 
            className="pl-10 h-11 bg-card/50 border-border/50 focus:bg-background transition-all rounded-xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6">
          {[1, 2].map(i => (
            <Card key={i} className="animate-pulse h-48 bg-card/30" />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <Card className="border-dashed border-2 bg-transparent">
          <CardContent className="p-20 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-xl font-bold text-foreground">
                {searchTerm ? "No results found" : "No students enrolled yet"}
              </p>
              <p className="text-muted-foreground max-w-xs mx-auto">
                {searchTerm 
                  ? "Try adjusting your search terms to find what you're looking for." 
                  : "Once students enroll in your courses, they will appear here grouped by course."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-8">
          {filteredGroups.map((group, groupIdx) => (
            <div
              key={group.courseId || groupIdx}
              id={group.courseId ? `course-${group.courseId}` : undefined}
              className="space-y-6 scroll-mt-24"
            >
              {/* Course Card Header */}
              <Card className="border-border/40 shadow-md overflow-hidden bg-card/50 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row">
                  {/* Course Thumbnail */}
                  <div className="h-32 md:h-auto md:w-48 bg-gray-100 flex items-center justify-center relative overflow-hidden">
                    <img
                      src={group.courseThumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60"}
                      alt={group.courseTitle}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    
                    {/* Status Badge */}
                    <div className="absolute top-3 right-3">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border backdrop-blur-sm",
                        group.courseStatus === "published" 
                          ? "bg-green-500/20 text-green-400 border-green-500/30" 
                          : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      )}>
                        {group.courseStatus === "published" ? "Published" : "Draft"}
                      </span>
                    </div>
                  </div>

                  {/* Course Info */}
                  <div className="flex-1 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <GraduationCap className="w-6 h-6 text-primary" />
                          <h2 className="text-2xl font-bold text-foreground tracking-tight">
                            {group.courseTitle}
                          </h2>
                        </div>
                        
                        {/* Stats */}
                        <div className="flex items-center gap-6 text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <UsersIcon className="w-4 h-4" />
                            <span className="text-sm font-medium">
                              {group.students.length} {group.students.length === 1 ? 'Student' : 'Students'}
                            </span>
                          </div>
                          
                          {group.courseReviewCount && group.courseReviewCount > 0 && (
                            <div className="flex items-center gap-2">
                              <Star className="w-4 h-4 text-amber-500" />
                              <span className="text-sm font-medium text-amber-400">
                                {group.courseRating?.toFixed(1)} ({group.courseReviewCount})
                              </span>
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            <span className="text-sm font-medium capitalize">
                              {group.courseStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Students Table */}
              <Card className="border-border/40 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/20 text-muted-foreground">
                          <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px]">Student Info</th>
                          <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px]">Enrollment Date</th>
                          <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px]">Learning Progress</th>
                          <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px]">Last Activity</th>
                          <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px]">Certificate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {group.students.map((s, idx) => (
                          <tr key={idx} className="hover:bg-muted/30 transition-colors group">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-border/50 shadow-sm">
                                  <AvatarImage src={s.avatar || undefined} />
                                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                    {s.name.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-bold text-foreground group-hover:text-primary transition-colors">{s.name}</div>
                                  <div className="text-xs text-muted-foreground font-medium">{s.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Calendar className="w-3.5 h-3.5" />
                                <span className="font-medium">{new Date(s.enrolledAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="space-y-2 max-w-[180px]">
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                                  <span className={(s.isCompleted || s.progress === 100) ? "text-green-500" : "text-muted-foreground"}>
                                    {(s.isCompleted || s.progress === 100) ? "Completed" : "In Progress"}
                                  </span>
                                  <span className="text-foreground">{s.progress}%</span>
                                </div>
                                <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full transition-all duration-500 rounded-full",
                                      (s.isCompleted || s.progress === 100) ? "bg-green-500" : "bg-primary"
                                    )} 
                                    style={{ width: `${s.progress}%` }} 
                                  />
                                </div>
                                {typeof s.completedLessons === "number" && typeof s.totalLessons === "number" && s.totalLessons > 0 && (
                                  <p className="text-[10px] text-muted-foreground">
                                    {s.completedLessons}/{s.totalLessons} lessons
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-muted-foreground text-xs">
                              {s.lastAccessed
                                ? new Date(s.lastAccessed).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}
                            </td>
                            <td className="p-4">
                              <span className={cn(
                                "text-xs font-medium",
                                s.hasCertificate ? "text-green-500" : "text-muted-foreground"
                              )}>
                                {s.hasCertificate ? "Issued" : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

