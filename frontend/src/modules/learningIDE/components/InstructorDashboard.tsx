import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, BookOpen, Users, FileText, ExternalLink, Share2, Loader2, Search, ArrowLeft, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useToastStore } from '@/store/toastStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CourseCardBanner } from '@/components/common/CourseCardBanner';

interface ResourceCourse {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  instructorId: string;
  published: boolean;
  instructor?: {
    firstName: string;
    lastName: string;
  };
  createdAt: string;
  updatedAt: string;
  content?: {
    updatedAt: string;
    pdfUrl?: string;
  };
}

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.add);
  const [courses, setCourses] = useState<ResourceCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTogglingPublish, setIsTogglingPublish] = useState<string | null>(null);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setIsLoading(true);
      const response = await api<ResourceCourse[]>('/resources/courses/instructor');
      if (response.data) {
        setCourses(response.data);
      }
    } catch (err: any) {
      addToast({ title: "Error", description: "Failed to load courses", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCourse = () => {
    navigate("/manage-courses/new");
  };

  const handleEditBranding = (courseId: string) => {
    navigate(`/manage-courses/new/branding?edit=${courseId}&productType=free-course&studio=academic`);
  };

  const deleteCourse = async (courseId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this resource? All project files, LaTeX code, and uploaded assets will be permanently removed from the database and storage. This cannot be undone.');
    
    if (!confirmed) return;

    try {
      const previousCourses = [...courses];
      setCourses(prev => prev.filter(course => course.id !== courseId));

      const response = await api(`/resources/courses/${courseId}`, {
        method: 'DELETE'
      });

      if (response.error) {
        setCourses(previousCourses);
        addToast({ title: "Delete Failed", description: response.error, variant: "destructive" });
      } else {
        addToast({ title: "Resource Deleted", description: "All associated data removed successfully.", variant: "success" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: "Failed to delete resource", variant: "destructive" });
    }
  };

  const togglePublish = async (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    if (course && !course.published && !course.thumbnail) {
      addToast({
        title: "Banner required",
        description: "Please set a banner before publishing.",
        variant: "destructive",
      });
      handleEditBranding(courseId);
      return;
    }

    try {
      setIsTogglingPublish(courseId);
      const response = await api<{ success: boolean; published: boolean; message: string }>(`/resources/courses/${courseId}/toggle-publish`, {
        method: 'POST'
      });

      if (response.data?.success) {
        setCourses(prev => prev.map(c => c.id === courseId ? { ...c, published: response.data!.published } : c));
        addToast({ 
          title: response.data.published ? "Course Published" : "Course Unpublished", 
          description: response.data.published ? "Your course is now visible to students." : "Your course has been hidden from students.", 
          variant: response.data.published ? "success" : "default" 
        });
      } else {
        addToast({ title: "Error", description: response.error || "Failed to update status", variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: "Failed to toggle publish status", variant: "destructive" });
    } finally {
      setIsTogglingPublish(null);
    }
  };

  const filteredCourses = courses.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-background selection:bg-primary/20">
      {/* Modern Header */}
      <header className="bg-white dark:bg-card border-b border-border sticky top-0 z-10 backdrop-blur-md">
        <div className="app-workspace w-full max-w-none px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/resources')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-bold text-sm">Ecosystem</span>
            </button>
            <div className="h-8 w-px bg-border" />
            <h1 className="page-title flex items-center gap-3">
              <Users className="w-7 h-7 text-primary" />
              Manage Courses
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search resources..." 
                className="w-full pl-9 pr-4 py-2 rounded-full border border-border bg-secondary/30 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              onClick={handleCreateCourse}
              className="rounded-full px-6 bg-[#04AA6D] hover:bg-[#059862] text-white font-bold shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Course
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-workspace w-full max-w-none px-6 py-12">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground font-medium">Loading courses...</p>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-32 bg-secondary/10 rounded-[3rem] border-2 border-dashed border-border">
            <BookOpen className="w-20 h-20 mx-auto mb-6 opacity-10" />
            <h3 className="text-2xl font-bold mb-2">No courses found</h3>
            <p className="text-muted-foreground mb-10 max-w-sm mx-auto">
              Ready to share your knowledge? Create your first tutorial today.
            </p>
            <Button
              onClick={handleCreateCourse}
              size="lg"
              className="rounded-2xl px-10 font-bold bg-[#04AA6D] hover:bg-[#059862] text-white"
            >
              Get Started
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredCourses.map((course) => (
              <Card 
                key={course.id} 
                className="group overflow-hidden border-border hover:border-[#04AA6D]/30 hover:shadow-2xl transition-all duration-500 bg-white dark:bg-card flex flex-col"
              >
                {/* Thumbnail */}
                <CourseCardBanner
                  thumbnailUrl={course.thumbnail}
                  alt={course.title}
                  placeholderSeed={course.title}
                  zoomOnHover
                >
                  <div className="absolute top-4 right-4 z-10">
                    <Badge variant={course.published ? "default" : "secondary"} className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest shadow-lg">
                      {course.published ? "Published" : "Draft"}
                    </Badge>
                  </div>
                </CourseCardBanner>

                <div className="p-8 flex-1 flex flex-col">
                  <h3 className="text-2xl font-bold mb-2 group-hover:text-[#04AA6D] transition-colors line-clamp-2">{course.title}</h3>
                  <div className="flex items-center gap-2 mb-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px]">
                      {course.instructor?.firstName?.[0] || 'A'}
                    </div>
                    {course.instructor ? `${course.instructor.firstName} ${course.instructor.lastName}` : 'Admin'} • {new Date(course.createdAt).toLocaleDateString()}
                  </div>
                  
                  <p className="text-muted-foreground text-sm line-clamp-3 mb-6">
                    {course.description || "Interactive tutorial designed to master modern technology."}
                  </p>
                  
                  <div className="mt-auto space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        variant="outline"
                        className="font-bold rounded-xl border-[#04AA6D] text-[#04AA6D] hover:bg-[#04AA6D] hover:text-white transition-all gap-2"
                        onClick={() =>
                          navigate(
                            `/instructor/learning-universe/new/academic?edit=${course.id}&productType=free-course`
                          )
                        }
                      >
                        <FileText className="w-4 h-4" /> Editor
                      </Button>
                      <Button 
                        variant="outline"
                        className="font-bold rounded-xl border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white transition-all gap-2"
                        onClick={() => navigate(`/resources/course/${course.id}`)}
                      >
                        <ExternalLink className="w-4 h-4" /> Student
                      </Button>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full font-bold rounded-xl border-primary/30 text-primary hover:bg-primary/10 transition-all gap-2"
                      onClick={() => handleEditBranding(course.id)}
                    >
                      <ImageIcon className="w-4 h-4" /> Banner Studio
                    </Button>
                    
                    <Button 
                      disabled={isTogglingPublish === course.id}
                      className={cn(
                        "w-full font-bold rounded-xl shadow-lg transition-all gap-2 h-11",
                        course.published 
                          ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/10" 
                          : "bg-[#04AA6D] hover:bg-[#059862] shadow-emerald-500/10"
                      )}
                      onClick={() => togglePublish(course.id)}
                    >
                      {isTogglingPublish === course.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Share2 className="w-4 h-4" /> 
                          {course.published ? "Unpublish" : "Publish"}
                        </>
                      )}
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      className="w-full font-bold rounded-xl text-destructive hover:bg-destructive/10 transition-all gap-2"
                      onClick={() => deleteCourse(course.id)}
                    >
                      <Trash2 className="w-4 h-4" /> Delete Permanently
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
