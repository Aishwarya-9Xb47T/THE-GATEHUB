import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, PlayCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export default function VideoPlayerPage() {
  const { courseId, slug } = useParams<{ courseId: string; slug: string }>();
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadVideoData();
  }, [courseId, slug]);

  const loadVideoData = async () => {
    try {
      setIsLoading(true);
      const response = await api<any>(`/resources/courses/${courseId}`);
      if (response.error || !response.data) throw new Error("Course not found");
      
      setCourseTitle(response.data.title);
      
      const contentRes = await api<any>(`/resources/content/${courseId}`);
      if (contentRes.data && contentRes.data.assets) {
        // Find asset matching slug (ignoring extension)
        const asset = contentRes.data.assets.find((a: any) => 
          a.type === 'video' && a.name.toLowerCase().replace(/[^a-z0-9]/g, '-').includes(slug || "")
        );
        
        if (asset) {
          setVideoUrl(`${API_BASE_URL}/uploads/resources/${encodeURIComponent(asset.name)}`);
        } else {
          setError("Video not found in this course.");
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin text-[#04AA6D] mb-4" />
        <p className="animate-pulse">Loading Video Experience...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0f172a] flex flex-col overflow-hidden text-white">
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-[#1e293b]">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/resources/course/${courseId}`)}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold text-sm">Back to Tutorial</span>
          </button>
          <div className="h-6 w-px bg-white/10" />
          <h1 className="font-bold text-lg truncate max-w-md">{courseTitle}</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 bg-black">
        {error ? (
          <div className="text-center max-w-md">
            <PlayCircle className="w-20 h-20 mx-auto mb-6 text-red-500 opacity-50" />
            <h2 className="text-2xl font-bold mb-2">Video Unavailable</h2>
            <p className="text-white/60 mb-8">{error}</p>
            <button 
              onClick={() => navigate(`/resources/course/${courseId}`)}
              className="px-8 py-3 bg-[#04AA6D] rounded-full font-bold hover:bg-[#059862] transition-all"
            >
              Return to Course
            </button>
          </div>
        ) : (
          <div className="w-full aspect-video rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            {videoUrl && (
              <video 
                controls 
                autoPlay 
                className="w-full h-full"
                poster="/video-poster.jpg"
              >
                <source src={videoUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        )}
      </main>
      
      <footer className="p-6 bg-[#1e293b] text-center border-t border-white/10">
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest">
          THE GATEHUB Video Experience • Professional Learning
        </p>
      </footer>
    </div>
  );
}
