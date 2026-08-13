import { useState, useEffect } from "react";
import { FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";

interface NotesPreviewProps {
  lecture: any;
  user: any;
  isEnrolled: boolean;
  isCourseCompleted: boolean;
  onRegisterClick: () => void;
  onEnrollClick: () => void;
}

export function NotesPreview({ 
  lecture, 
  user, 
  isEnrolled, 
  isCourseCompleted, 
  onRegisterClick, 
  onEnrollClick 
}: NotesPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const shouldShowGuestAuthPrompt = !user;
  const shouldShowEnrollPrompt = user && !isEnrolled && !isCourseCompleted;

  // Premium access logic
  const hasFullAccess = user && (isEnrolled || isCourseCompleted);

  // ADD DEBUG:
  console.log("NOTES PREVIEW RECEIVED:", lecture);
  console.log("FINAL LECTURE IN PREVIEW:", {
    lectureId: lecture?.id,
    hasCompiledPdfUrl: !!lecture?.compiledPdfUrl,
    compiledPdfUrl: lecture?.compiledPdfUrl,
    lectureObject: lecture,
    hasFullAccess,
    user: !!user,
    isEnrolled,
    isCourseCompleted
  });

  useEffect(() => {
    if (!lecture) return;

    const url = lecture.compiledPdfUrl;

    console.log("PDF DEBUG:", url);

    if (!url) {
      setPdfError("No PDF URL received");
      return;
    }

    // Prefer same-origin /uploads resolution — never bake localhost into the viewer.
    const resolved =
      resolveCourseMediaUrl(url.startsWith("http") || url.startsWith("/") ? url : `/${url}`) || url;
    const baseUrl = resolved;
    
    // Premium PDF access restriction
    const finalPdfUrl = hasFullAccess 
      ? `${baseUrl}#zoom=page-width&view=FitH`
      : `${baseUrl}#page=1&zoom=page-fit&toolbar=0&navpanes=0&scrollbar=0`;

    console.log("PDF ACCESS DEBUG:", {
      hasFullAccess,
      finalPdfUrl,
      baseUrl
    });

    setPdfUrl(finalPdfUrl);
  }, [lecture, hasFullAccess]);

  return (
    <div className="border-b border-border/30">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{lecture.title}</span>
        </div>
        {shouldShowGuestAuthPrompt && (
          <span className="text-xs font-bold text-primary uppercase tracking-widest">Locked</span>
        )}
        {shouldShowEnrollPrompt && (
          <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Preview</span>
        )}
      </div>
      
      {/* PDF Preview Container */}
      <div className="w-full h-[650px] flex justify-center items-center bg-muted/20 rounded-xl">
        <div className="w-full h-full bg-white rounded-lg shadow-xl overflow-hidden relative">
          {pdfError ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
              <p className="text-center px-4">{pdfError}</p>
            </div>
          ) : pdfUrl ? (
            <>
              <iframe
                src={pdfUrl}
                className={cn(
                  "w-full h-full border-none",
                  !hasFullAccess && "pointer-events-none"
                )}
                title="PDF Notes Preview"
              />
              
              {/* Premium Overlay for Restricted Users */}
              {!hasFullAccess && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white z-10 backdrop-blur-sm">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold">🔒 Enroll to unlock full notes</h3>
                    <p className="text-white/80 max-w-sm">
                      Get access to complete course materials, downloadable PDFs, and study resources
                    </p>
                    <div className="flex gap-3">
                      {shouldShowGuestAuthPrompt ? (
                        <button
                          onClick={onRegisterClick}
                          className="bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-bold transition-colors"
                        >
                          Sign Up Free
                        </button>
                      ) : (
                        <button
                          onClick={onEnrollClick}
                          className="bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-bold transition-colors"
                        >
                          Enroll Now
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-white/60">
                      First page preview • Full access requires enrollment
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <FileText className="w-8 h-8 mx-auto mb-2" />
                <p>Loading PDF...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
