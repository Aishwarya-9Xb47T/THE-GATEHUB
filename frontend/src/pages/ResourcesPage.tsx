import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  ArrowLeft, 
  GraduationCap, 
  Layout, 
  Clock, 
  ChevronRight,
  Search,
  BookMarked,
  Sparkles,
  Layers,
  FileText,
  User,
  Users,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '@/store/toastStore';
import { useUserStore } from '@/store/userStore';
import { api } from '@/lib/api';
import { BrandHomeButton } from '@/components/common/Logo';
import { AppAssistantFooter } from '@/assistant/AppAssistantFooter';
import { CourseCardBanner } from '@/components/common/CourseCardBanner';

interface ResourceCourse {
  id: string;
  title: string;
  description: string;
  thumbnail?: string | null;
  bannerUrl?: string | null;
  instructor?: {
    firstName?: string;
    lastName?: string;
  };
  content?: {
    structuredContent: any;
    compiledHtml: string;
  } | null;
  deliveryMode?: "learning-universe" | "legacy-resource";
  updatedAt: string;
}

export default function ResourcesPage() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.add);
  const { user } = useUserStore();
  const [courses, setCourses] = useState<ResourceCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
      const endpoint = isInstructor ? '/resources/courses/instructor' : '/resources/courses';
      const response = await api<ResourceCourse[]>(endpoint);
      if (response.data) {
        const safeCourses = response.data.map(course => ({
          ...course,
          instructor: course.instructor || { firstName: "Instructor", lastName: "" }
        }));
        setCourses(safeCourses);
      }
    } catch (err: any) {
      console.error("Failed to fetch resource courses:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCourseSelect = (course: ResourceCourse) => {
    if (course.deliveryMode === "learning-universe" || !course.content) {
      navigate(`/learning-universe/${course.id}/course`);
      return;
    }
    navigate(`/resources/course/${course.id}`);
  };

  const handleManageCourses = () => {
    navigate('/manage-courses');
  };

  const filteredCourses = courses.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">
      {/* Top Navigation */}
      <nav className="h-20 border-b border-border bg-white/80 dark:bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="app-workspace w-full max-w-none h-full px-6 flex items-center justify-between">
          <BrandHomeButton />
          
          <div className="flex items-center gap-4">
            {isInstructor && (
              <Button 
                onClick={() => navigate('/manage-courses')}
                variant="outline"
                className="rounded-full border-[#04AA6D] text-[#04AA6D] hover:bg-[#04AA6D] hover:text-white font-bold transition-all"
              >
                <Users className="w-4 h-4 mr-2" />
                Manage Courses
              </Button>
            )}
            <Button 
              onClick={() => navigate('/')}
              variant="ghost"
              className="rounded-full font-bold"
            >
              Main Dashboard
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Header */}
      <div className="relative bg-secondary/30 border-b border-border overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -z-10 translate-x-1/2 -translate-y-1/2" />
        <div className="app-workspace w-full max-w-none px-6 py-16 md:py-24 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-6">
              <BookMarked className="w-3.5 h-3.5" /> Premium Resources
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Free Learning <span className="text-primary">Ecosystem</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed mb-10">
              Access high-quality, structured tutorials and interactive coding playgrounds designed to master modern technology.
            </p>
            <div className="flex flex-wrap gap-4">
              {isInstructor && (
                <Button onClick={handleManageCourses} size="lg" className="bg-[#04AA6D] hover:bg-[#059862] text-white gap-2 shadow-lg shadow-emerald-500/20 rounded-2xl h-14 px-8 font-semibold transition-all hover:-translate-y-1">
                  <Layout className="w-5 h-5" /> Manage Courses
                </Button>
              )}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search tutorials, topics..." 
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-sm font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="app-workspace w-full max-w-none px-6 py-16">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Available Tutorials</h2>
            <p className="text-muted-foreground">Pick a subject and start your interactive learning journey.</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground bg-secondary/50 px-4 py-2 rounded-full uppercase tracking-wider">
            <Layers className="w-4 h-4" /> {filteredCourses.length} Resources
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <Card key={i} className="h-64 animate-pulse bg-secondary/20 border-border rounded-3xl" />
            ))}
          </div>
        ) : filteredCourses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredCourses.map(course => (
              <Card 
                key={course.id} 
                className="group relative overflow-hidden border-border hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 cursor-pointer flex flex-col rounded-3xl p-0"
                onClick={() => handleCourseSelect(course)}
              >
                {(course.bannerUrl || course.thumbnail) && (
                  <CourseCardBanner
                    bannerUrl={course.bannerUrl}
                    thumbnailUrl={course.thumbnail}
                    alt={course.title}
                    placeholderSeed={course.title}
                    className="rounded-t-3xl rounded-b-none"
                  />
                )}
                <div className="p-8 flex-1">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    {isInstructor && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/instructor/latex-editor/${course.id}`);
                        }}
                      >
                        <Layout className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors line-clamp-1">{course.title}</h3>
                  <p className="text-muted-foreground line-clamp-2 mb-8 leading-relaxed min-h-[3rem]">{course.description}</p>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-bold uppercase tracking-widest border-t border-border/50 pt-6">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> {course?.instructor?.firstName || "Instructor"}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> {course?.updatedAt ? new Date(course.updatedAt).toLocaleDateString() : "Recently"}
                    </div>
                  </div>
                </div>
                <div className="px-8 py-5 bg-secondary/30 border-t border-border flex items-center justify-between group-hover:bg-primary/5 transition-colors">
                  <span className="text-sm font-bold text-primary flex items-center gap-1.5 uppercase tracking-wider">
                    Start Learning <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="flex -space-x-2">
                    <div className="w-7 h-7 rounded-full border-2 border-background bg-slate-200" />
                    <div className="w-7 h-7 rounded-full border-2 border-background bg-slate-300" />
                    <div className="w-7 h-7 rounded-full border-2 border-background bg-slate-400" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-32 bg-secondary/20 rounded-[3rem] border-2 border-dashed border-border">
            <BookOpen className="w-20 h-20 mx-auto mb-6 opacity-10" />
            <h3 className="text-2xl font-bold mb-2">No resources found</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              We couldn't find any tutorials matching your search. Try a different keyword or check back later!
            </p>
          </div>
        )}
      </div>
      <AppAssistantFooter layout="corner" className="mt-16" innerClassName="app-workspace app-workspace--lg" />
    </div>
  );
}
