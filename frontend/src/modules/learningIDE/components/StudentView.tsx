import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft, Clock, User, Share2, Download, PlayCircle } from 'lucide-react';
import { StudentLearningExperience } from '@/components/learning/StudentLearningExperience';
import { api } from '@/lib/api';

interface ResourceContent {
  id: string;
  courseId: string;
  latexContent: string;
  compiledHtml: string;
  structuredContent: any;
  pdfUrl?: string;
  updatedAt: string;
}

interface ResourceCourse {
  id: string;
  title: string;
  description?: string;
  instructorId: string;
  instructor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  content?: ResourceContent;
}

export default function StudentView() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<ResourceCourse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) {
      navigate('/resources');
      return;
    }

    loadCourse();
  }, [courseId, navigate]);

  const loadCourse = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await api<ResourceCourse>(`/resources/courses/${courseId}`);
      if (response.error || !response.data) {
        throw new Error(response.error || 'Course not found');
      }

      setCourse(response.data);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to load course');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground animate-pulse">Loading learning ecosystem...</p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
          <BookOpen className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Resource Unavailable</h2>
        <p className="text-muted-foreground max-w-md mb-8">{error || 'The requested resource could not be found.'}</p>
        <button
          onClick={() => navigate('/resources')}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-all shadow-lg"
        >
          Back to All Resources
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Enhanced W3Schools Style Header */}
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate('/resources')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center group-hover:bg-secondary/80">
              <ArrowLeft className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm hidden sm:inline">All Resources</span>
          </button>
          
          <div className="h-6 w-px bg-border hidden sm:block" />
          
          <div className="flex flex-col">
            <h1 className="font-bold text-lg tracking-tight truncate max-w-[200px] md:max-w-md">
              {course.title}
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
              <span className="text-primary">Free Tutorial</span>
              <span>•</span>
              <span>{course.instructor?.firstName} {course.instructor?.lastName}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {course.content?.pdfUrl && (
            <a 
              href={course.content.pdfUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-full text-xs font-bold transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">PDF Notes</span>
            </a>
          )}
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full text-xs font-semibold shadow-lg shadow-primary/20 hover:opacity-90 transition-all">
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Share</span>
          </button>
        </div>
      </header>

      {/* Main Content Area - W3Schools Experience */}
      <div className="flex-1 overflow-hidden">
        {course.content?.structuredContent ? (
          <StudentLearningExperience data={course.content.structuredContent} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-secondary/10">
            <div className="w-24 h-24 bg-card rounded-[2rem] shadow-xl flex items-center justify-center mb-8 relative">
              <BookOpen className="w-12 h-12 text-primary opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                <PlayCircle className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-4">Content Not Yet Published</h2>
            <p className="text-muted-foreground max-w-lg mb-8 leading-relaxed">
              The instructor is currently crafting this learning experience. 
              Check back soon for the full rendered tutorial, interactive playground, and formulas!
            </p>
            <button
              onClick={() => navigate('/resources')}
              className="px-8 py-4 bg-card border border-border rounded-2xl font-bold hover:bg-secondary transition-all shadow-sm"
            >
              Explore Other Tutorials
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
