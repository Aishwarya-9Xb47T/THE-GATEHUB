import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { AlertCircle, Loader2, Play, Save, Upload, Image, FileText, Video, Download, RefreshCw, ChevronDown, ChevronRight, Type, Table, List, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";
import { useAuthStore } from "@/store/authStore";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCourseContentCaches } from "@/lib/courseContentCache";

interface Lecture {
  id: string;
  title: string;
  content: string;
  compiledPdfUrl?: string;
  type?: string;
  updatedAt?: string;
}

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

interface CompileError {
  message: string;
  line: number | null;
  raw: string;
}

interface CompileResponse {
  success: boolean;
  pdfBase64?: string;
  pdfUrl?: string;
  error?: string;
  logs?: string;
  errors?: CompileError[];
}

const LECTURE_CONTENT_STORAGE_KEY = (lectureId: string) => `lecture-latex-content-${lectureId}`;
const AUTO_SAVE_DELAY_MS = 3000; // 3 seconds auto-save
const AUTO_COMPILE_DELAY_MS = 5000; // 5 seconds auto-compile

function escapeForLatexTitle(title: string): string {
  return title.replace(/\\/g, '\\backslash ').replace('{', '\\{').replace('}', '\\}');
}

function buildDefaultTemplate(title: string): string {
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}
\\usepackage{graphicx}
\\usepackage[margin=1in]{geometry}
\\title{${escapeForLatexTitle(title)}}
\\author{Instructor}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Lecture Notes}
Your content here.

\\end{document}`;
}

function saveToLocalStorage(lectureId: string, content: string): void {
  try {
    localStorage.setItem(LECTURE_CONTENT_STORAGE_KEY(lectureId), content);
  } catch (error: any) {
    console.warn("Failed to save to localStorage:", error);
  }
}

function loadFromLocalStorage(lectureId: string): string | null {
  try {
    return localStorage.getItem(LECTURE_CONTENT_STORAGE_KEY(lectureId));
  } catch (error: any) {
    console.warn("Failed to load from localStorage:", error);
    return null;
  }
}

function clearFromLocalStorage(lectureId: string): void {
  try {
    localStorage.removeItem(LECTURE_CONTENT_STORAGE_KEY(lectureId));
  } catch (error: any) {
    console.warn("Failed to clear localStorage:", error);
  }
}

export function LectureNotesEditor() {
  const { courseId, lectureId } = useParams<{ courseId: string; lectureId: string }>();
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.add);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  
  // Debug: Log authentication status
  useEffect(() => {
    console.log("🔐 CRITICAL FIX - LectureNotesEditor auth status:", {
      lectureId,
      hasToken: !!token,
      tokenLength: token?.length,
      tokenPreview: token ? `${token.substring(0, 20)}...` : null,
      user: user ? {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      } : null
    });
  }, [lectureId, token, user]);

  const [lecture, setLecture] = useState<Lecture | null>(null);

  // CRITICAL FIX: Log content preservation
  useEffect(() => {
    if (lecture) {
      console.log("🔧 CRITICAL FIX - Lecture data:", {
        lectureId: lecture.id,
        title: lecture.title,
        contentType: typeof lecture.content,
        contentLength: lecture.content?.length,
        contentStart: lecture.content?.substring(0, 50),
        compiledPdfUrl: lecture.compiledPdfUrl,
        hasCompiledPdfUrl: !!lecture.compiledPdfUrl
      });
    }
  }, [lecture]);
  const [content, setContent] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [compileLogs, setCompileLogs] = useState<string | null>(null);
  const [compileErrors, setCompileErrors] = useState<CompileError[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [autoCompileEnabled, setAutoCompileEnabled] = useState(true);
  const [documentStructure, setDocumentStructure] = useState<any[]>([]);
  const [showStructure, setShowStructure] = useState(true);

  const editorRef = useRef<any>(null);
  const saveTimerRef = useRef<number | null>(null);
  const compileTimerRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const originalContentRef = useRef("");
  const pdfPreviewRef = useRef<HTMLIFrameElement>(null);

  const saveLabel = isSaving ? "Saving..." : hasPendingChanges ? "Unsaved changes" : lastSavedAt ? `Saved at ${lastSavedAt.toLocaleTimeString()}` : "Ready";

  // Load lecture data
  const loadLecture = useCallback(async () => {
    if (!lectureId) return;
    
    setIsLoading(true);
    try {
      const response = await api<{ success: boolean; lecture: Lecture }>(`/lectures/${lectureId}/notes`);
      if (response.error || !response.data?.lecture) {
        throw new Error(response.error || "Failed to load lecture notes");
      }
      
      const lectureData = response.data.lecture;
      setLecture(lectureData);
      
      // Try to get content from localStorage first (for offline persistence)
      const localContent = loadFromLocalStorage(lectureId);
      
      // CRITICAL FIX: content should ALWAYS be LaTeX, never PDF URL
      let serverContent: string | null = lectureData.content;
      console.log("🔧 CRITICAL FIX - Content analysis:", {
        content: serverContent?.substring(0, 50),
        isPdfUrl: serverContent?.startsWith('/uploads/'),
        compiledPdfUrl: (lectureData as any).compiledPdfUrl
      });
      
      // content should NEVER be a PDF URL - it should always be LaTeX
      if (serverContent && (serverContent.startsWith('/uploads/') || serverContent.startsWith('http'))) {
        console.warn("🚨 CRITICAL: content contains PDF URL - this should never happen!");
        // This is a bug - content should always be LaTeX
        serverContent = null;
      }
      
      const finalContent = localContent || serverContent || buildDefaultTemplate(lectureData.title);
      
      setContent(finalContent);
      originalContentRef.current = finalContent;
      setHasPendingChanges(localContent !== null);
      
      // Clear localStorage if we successfully loaded from server
      if (localContent && lectureData.content) {
        clearFromLocalStorage(lectureId);
      }
      
    } catch (error: any) {
      addToast({
        title: "Failed to load lecture notes",
        description: error?.message || "Could not load lecture notes",
        variant: "destructive",
      });
      // Fallback to default template
      setContent(buildDefaultTemplate("Lecture Notes"));
    } finally {
      setIsLoading(false);
    }
  }, [lectureId, addToast]);

  // Save lecture content
  const saveLecture = useCallback(async (notify = false) => {
    if (!lectureId || isSavingRef.current) return false;

    const currentContent = editorRef.current?.getValue() || content;
    if (currentContent === originalContentRef.current) return true;

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const response = await api<{ success: boolean; lecture: Lecture }>(`/lectures/${lectureId}/notes`, {
        method: "PATCH",
        body: { content: currentContent },
      });

      if (response.error || !response.data?.lecture) {
        throw new Error(response.error || "Failed to save lecture notes");
      }

      originalContentRef.current = currentContent;
      setHasPendingChanges(false);
      setLastSavedAt(new Date());
      clearFromLocalStorage(lectureId); // Clear backup after successful save

      if (notify) {
        addToast({ title: "Lecture notes saved", variant: "success" });
      }

      return true;
    } catch (error: any) {
      // Save to localStorage as fallback
      saveToLocalStorage(lectureId, currentContent);
      
      addToast({
        title: "Save failed, saved locally",
        description: error?.message || "Could not save to server, saved locally",
        variant: "destructive",
      });
      return false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [lectureId, content, addToast]);

  // Compile LaTeX
  const compileLecture = useCallback(async (notify = true) => {
    if (!lectureId || !token || isCompiling) {
      if (!token && notify) {
        addToast({
          title: "Authentication required",
          description: "Please log in to compile and attach notes",
          variant: "destructive",
        });
      }
      return;
    }

    const currentContent = editorRef.current?.getValue() || content;
    
    setIsCompiling(true);
    try {
      // Save before compiling
      await saveLecture(false);
      
      // Clean LaTeX before compilation
      const cleanedLatex = cleanLatexForCompilation(currentContent);
      console.log("Sending LaTeX (cleaned):", cleanedLatex);
      
      const response = await fetch("/api/latex/compile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          code: cleanedLatex,
          projectId: lectureId,
          force: true 
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as any;
      
      console.log("Compile Response:", payload);

      if (!response.ok || !payload.success) {
        setCompileErrors(payload.errors ?? []);
        setCompileLogs(payload.logs || payload.error || "Compilation failed");
        if (notify) {
          addToast({
            title: "Compilation failed",
            description: payload.error || "Fix the LaTeX errors and retry",
            variant: "destructive",
          });
        }
        return;
      }

      // Handle PDF response
      if (payload.pdfBase64) {
        const pdfBlob = new Blob([Uint8Array.from(atob(payload.pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfUrl(pdfUrl);
      } else if (payload.fileUrl) {
        setPdfUrl(payload.fileUrl);
        console.log("📄 PDF compiled successfully:", payload.fileUrl);
        
        // Auto-attach the compiled PDF to the lecture
        const attachmentSuccess = await attachNotesToLecture(payload.fileUrl);
        
        console.log("📄 Attachment result:", attachmentSuccess);
        
        if (notify) {
          if (attachmentSuccess) {
            addToast({
              title: "Compilation complete - Notes attached to lecture",
              variant: "success",
            });
          } else {
            addToast({
              title: "Compilation complete - Failed to attach notes",
              description: "PDF was compiled but could not be attached to lecture",
              variant: "destructive",
            });
          }
        }
      }
      
      setCompileErrors([]);
      setCompileLogs(null);
    } catch (error: any) {
      setCompileLogs(error?.message || "Compilation request failed");
      setCompileErrors([]);
      if (notify) {
        addToast({
          title: "Compilation failed",
          description: error?.message || "Compilation request failed",
          variant: "destructive",
        });
      }
    } finally {
      setIsCompiling(false);
    }
  }, [lectureId, token, content, saveLecture, addToast]);

  // Attach compiled PDF to lecture
  const attachNotesToLecture = useCallback(async (fileUrl: string) => {
    console.log("🔗 Attachment attempt:", { 
      lectureId, 
      hasToken: !!token, 
      tokenLength: token?.length,
      userRole: user?.role,
      userId: user?.id,
      userEmail: user?.email
    });
    
    if (!lectureId) {
      console.error("🔗 Missing lecture ID");
      return false;
    }

    if (!token) {
      console.error("🔗 User not authenticated - cannot attach notes");
      // Show a user-friendly error message
      addToast({
        title: "Authentication required",
        description: "Please log in to attach notes to lectures",
        variant: "destructive",
      });
      return false;
    }
    
    if (!user) {
      console.error("🔗 User data not available - cannot attach notes");
      addToast({
        title: "Authentication required",
        description: "Please refresh the page and try again",
        variant: "destructive",
      });
      return false;
    }
    
    if (user.role !== "instructor") {
      console.error("🔗 User is not an instructor - cannot attach notes", {
        userRole: user.role,
        userId: user.id,
        userEmail: user.email
      });
      addToast({
        title: "Permission denied",
        description: `Only instructors can attach notes to lectures. Your role: ${user.role}`,
        variant: "destructive",
      });
      return false;
    }

    try {
      console.log("🔗 Attaching notes:", { lectureId, fileUrl });
      
      const response = await fetch(`/api/lectures/${lectureId}/attach-notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ fileUrl }),
      });

      console.log("🔗 Attachment response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("🔗 Attachment failed:", response.status, errorText);
        
        // Handle specific authentication errors
        if (response.status === 401) {
          addToast({
            title: "Authentication expired",
            description: "Please log in again to attach notes",
            variant: "destructive",
          });
        } else if (response.status === 403) {
          addToast({
            title: "Permission denied",
            description: "You don't have permission to modify this lecture",
            variant: "destructive",
          });
        } else {
          addToast({
            title: "Attachment failed",
            description: `Failed to attach notes (${response.status})`,
            variant: "destructive",
          });
        }
        
        throw new Error(`Failed to attach notes (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log("🔗 Notes attached successfully:", result);
      invalidateCourseContentCaches(queryClient, courseId);
      return true;
    } catch (error: any) {
      console.error("🔗 Failed to attach notes:", error);
      return false;
    }
  }, [lectureId, courseId, queryClient, token, user, addToast]);

// Function to convert URL to local path
const urlToLocalPath = (url: string): string => {
  // Convert http://localhost:5000/uploads/file.png to ./uploads/file.png
  return url.replace(/https?:\/\/[^\/]+/, '.');
};

// Function to clean LaTeX before compilation
const cleanLatexForCompilation = (latex: string): string => {
  let cleaned = latex;

  // Auto-add required packages if not present
  const hasGraphicx = cleaned.includes('\\usepackage{graphicx}');
  const hasPdfpages = cleaned.includes('\\usepackage{pdfpages}');
  const hasIncludegraphics = cleaned.includes('\\includegraphics');
  const hasIncludepdf = cleaned.includes('\\includepdf');

  // Add packages after \documentclass if needed
  const docClassMatch = cleaned.match(/\\documentclass(\[[^\]]*\])?\{[^}]+\}/);
  if (docClassMatch) {
    let packages = '';
    if (hasIncludegraphics && !hasGraphicx) {
      packages += '\\usepackage{graphicx}\n';
    }
    if (hasIncludepdf && !hasPdfpages) {
      packages += '\\usepackage{pdfpages}\n';
    }
    
    if (packages) {
      cleaned = cleaned.replace(docClassMatch[0], docClassMatch[0] + '\n' + packages);
    }
  }

  // Remove nested includegraphics commands
  cleaned = cleaned.replace(/\\includegraphics\{[^}]*\\includegraphics[^}]*\}/g, (match) => {
    // Extract the innermost content
    const innerMatch = match.match(/\\includegraphics\{([^}]+)\}/);
    return innerMatch ? `\\includegraphics{${innerMatch[1]}}` : match;
  });

  // Replace URLs with local paths
  cleaned = cleaned.replace(/https?:\/\/[^\/\s]+\/uploads\/([^}\s]+)/g, './uploads/$1');

  // Convert PDF includes to use pdfpages package
  cleaned = cleaned.replace(/\\includegraphics\[([^\]]*)\]\{([^}]+\.pdf)\}/g, '\\includepdf[$1]{$2}');
  cleaned = cleaned.replace(/\\includegraphics\{([^}]+\.pdf)\}/g, '\\includepdf[pages=-]{$1}');

  return cleaned;
};

// Parse document structure for sidebar
const parseDocumentStructure = (latex: string): any[] => {
  const structure: any[] = [];
  
  // Parse sections
  const sectionRegex = /\\(section|subsection|subsubsection)\*?\s*\{([^}]+)\}/g;
  let match;
  while ((match = sectionRegex.exec(latex)) !== null) {
    const level = match[1] === 'section' ? 1 : match[1] === 'subsection' ? 2 : 3;
    structure.push({
      type: 'section',
      level,
      title: match[2],
      line: latex.substring(0, match.index).split('\n').length
    });
  }
  
  // Parse equations
  const equationRegex = /\\begin\{(equation|align|eqnarray)\}/g;
  while ((match = equationRegex.exec(latex)) !== null) {
    structure.push({
      type: 'equation',
      title: `Equation ${structure.filter(s => s.type === 'equation').length + 1}`,
      line: latex.substring(0, match.index).split('\n').length
    });
  }
  
  // Parse figures
  const figureRegex = /\\begin\{figure\}/g;
  while ((match = figureRegex.exec(latex)) !== null) {
    structure.push({
      type: 'figure',
      title: `Figure ${structure.filter(s => s.type === 'figure').length + 1}`,
      line: latex.substring(0, match.index).split('\n').length
    });
  }
  
  // Parse tables
  const tableRegex = /\\begin\{table\}/g;
  while ((match = tableRegex.exec(latex)) !== null) {
    structure.push({
      type: 'table',
      title: `Table ${structure.filter(s => s.type === 'table').length + 1}`,
      line: latex.substring(0, match.index).split('\n').length
    });
  }
  
  return structure;
};

// Insert LaTeX snippets at cursor position
const insertLatexSnippet = (editor: any, snippet: string) => {
  const position = editor.getPosition();
  editor.executeEdits('insert-snippet', [{
    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
    text: snippet
  }]);
  editor.focus();
};

// Handle file upload from sidebar (supports all file types)
const handleSidebarFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  const isImage = file.type.startsWith('image/');
  const isDocument = /\.(pdf|doc|docx|txt|tex)$/i.test(file.name);

  if (!isImage && !isDocument) {
    addToast({ title: "Please select an image or document file", variant: "destructive" });
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    // Use general upload endpoint for all files
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    const fileUrl = result.url;
    
    const newFile: UploadedFile = {
      id: Date.now().toString(),
      name: file.name,
      url: fileUrl,
      type: file.type,
      size: file.size
    };
    setUploadedFiles(prev => [...prev, newFile]);
    addToast({ title: `${isImage ? 'Image' : 'Document'} added to files`, variant: "success" });
  } catch (error: any) {
    addToast({ title: "File upload failed", variant: "destructive" });
  }
  
  // Reset the input
  event.target.value = '';
}, [token, addToast]);

// Auto-save with debounce
useEffect(() => {
  if (!lectureId) return;

  const currentContent = editorRef.current?.getValue() || content;
  const hasChanges = currentContent !== originalContentRef.current;
  setHasPendingChanges(hasChanges);

  if (!hasChanges) return;

  // Auto-save with debounce
  if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  saveTimerRef.current = window.setTimeout(() => {
    void saveLecture(false);
  }, AUTO_SAVE_DELAY_MS);

  // Auto-compile with debounce (if enabled)
  if (autoCompileEnabled) {
    if (compileTimerRef.current) window.clearTimeout(compileTimerRef.current);
    compileTimerRef.current = window.setTimeout(() => {
      void compileLecture(false);
    }, AUTO_COMPILE_DELAY_MS);
  }

  return () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (compileTimerRef.current) window.clearTimeout(compileTimerRef.current);
  };
}, [content, lectureId, saveLecture, compileLecture, autoCompileEnabled]);

  // Load lecture on mount
  useEffect(() => {
    void loadLecture();
  }, [loadLecture]);

  // Save to localStorage on content change (backup)
  useEffect(() => {
    if (content && lectureId) {
      saveToLocalStorage(lectureId, content);
      // Parse document structure
      setDocumentStructure(parseDocumentStructure(content));
    }
  }, [content, lectureId]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0f172a] text-slate-200">
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
          Loading lecture notes...
        </div>
      </div>
    );
  }

  if (!lecture) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0f172a] text-slate-200">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Lecture not found</h2>
          <p className="text-muted-foreground">Unable to load the requested lecture.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0f172a] text-slate-100">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-800 bg-[#111827] px-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">{lecture.title}</h1>
          <p className="text-xs text-muted-foreground">Lecture Notes</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-slate-400">{saveLabel}</div>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => void saveLecture(true)}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => void compileLecture(true)}
            disabled={isCompiling}
          >
            {isCompiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Compile
          </Button>
          <Button
            size="sm"
            variant={autoCompileEnabled ? "default" : "outline"}
            className="gap-2"
            onClick={() => setAutoCompileEnabled(!autoCompileEnabled)}
          >
            <RefreshCw className="h-4 w-4" />
            Auto-Compile
          </Button>
          {pdfUrl && (
            <Button size="sm" variant="outline" className="gap-2" asChild>
              <a href={pdfUrl} download={`${lecture.title}-notes.pdf`}>
                <Download className="h-4 w-4" />
                PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* LaTeX Formatting Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 bg-[#0f172a] px-4 overflow-x-auto">
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, '\\section{New Section}')}
        >
          <Hash className="h-3.5 w-3.5" />
          Section
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, '\\subsection{New Subsection}')}
        >
          <Hash className="h-3.5 w-3.5" />
          Subsection
        </Button>
        <div className="w-px h-6 bg-slate-700" />
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, '\\textbf{bold text}')}
        >
          <Type className="h-3.5 w-3.5" />
          Bold
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, '\\textit{italic text}')}
        >
          <Type className="h-3.5 w-3.5 italic" />
          Italic
        </Button>
        <div className="w-px h-6 bg-slate-700" />
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, '\\begin{equation}\n  E = mc^2\n\\end{equation}')}
        >
          <span className="font-serif italic">∑</span>
          Equation
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, `$$\n  \\begin{bmatrix}\n    a & b \\\\\n    c & d\n  \\end{bmatrix}\n$$`)}
        >
          <span className="font-serif">[ ]</span>
          Matrix
        </Button>
        <div className="w-px h-6 bg-slate-700" />
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, `\\begin{itemize}\n  \\item Item 1\n  \\item Item 2\n\\end{itemize}`)}
        >
          <List className="h-3.5 w-3.5" />
          List
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, `\\begin{enumerate}\n  \\item Item 1\n  \\item Item 2\n\\end{enumerate}`)}
        >
          <List className="h-3.5 w-3.5" />
          Numbered
        </Button>
        <div className="w-px h-6 bg-slate-700" />
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, `\\begin{table}\n  \\centering\n  \\begin{tabular}{|c|c|}\n    \\hline\n    Header 1 & Header 2 \\\\\n    \\hline\n    Cell 1 & Cell 2 \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{Caption}\n\\end{table}`)}
        >
          <Table className="h-3.5 w-3.5" />
          Table
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-8 px-2 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => editorRef.current && insertLatexSnippet(editorRef.current, `\\includegraphics[width=0.8\\linewidth]{image.png}`)}
        >
          <Image className="h-3.5 w-3.5" />
          Image
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        {/* File Manager Sidebar - 2 columns */}
        <div className="relative min-h-0 border-r border-slate-800 bg-[#1a1f2e] lg:col-span-2 flex flex-col">
          {/* Tab Navigation */}
          <div className="flex h-10 items-center border-b border-slate-700 px-2">
            <button
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                !showStructure ? 'text-cyan-400 bg-slate-800' : 'text-slate-400 hover:text-slate-300'
              }`}
              onClick={() => setShowStructure(false)}
            >
              Files
            </button>
            <button
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                showStructure ? 'text-cyan-400 bg-slate-800' : 'text-slate-400 hover:text-slate-300'
              }`}
              onClick={() => setShowStructure(true)}
            >
              Structure
            </button>
          </div>

          {/* Files Tab */}
          {!showStructure && (
            <>
              <div className="flex h-10 items-center justify-between border-b border-slate-700 px-3 text-xs text-slate-400">
                <span className="font-medium">Uploaded Files</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 h-6 px-2 text-xs hover:bg-slate-600 text-white"
                  onClick={() => document.getElementById('sidebar-file-upload')?.click()}
                >
                  <Image className="h-3 w-3" />
                  Upload
                </Button>
              </div>
              <input
                id="sidebar-file-upload"
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt,.tex"
                style={{ display: 'none' }}
                onChange={handleSidebarFileUpload}
              />
              
              <div className="p-4">
                <div className="space-y-2">
                  {uploadedFiles.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm py-8">
                      <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No files uploaded</p>
                      <p className="text-xs mt-1">Upload images or documents</p>
                    </div>
                  ) : (
                    uploadedFiles.map((file) => {
                      const isImage = file.type.startsWith('image/');
                      const isPdf = file.name.endsWith('.pdf');
                      const isDoc = /\.(doc|docx)$/i.test(file.name);
                      const isTex = file.name.endsWith('.tex');
                      
                      return (
                        <div
                          key={file.id}
                          className="group flex items-center gap-2 p-2 rounded hover:bg-slate-700 cursor-pointer border border-transparent hover:border-slate-600 transition-all"
                          onClick={() => {
                            const editor = editorRef.current;
                            if (editor) {
                              const position = editor.getPosition();
                              let latexSyntax = '';
                              
                              // Convert URL to local path
                              const localPath = urlToLocalPath(file.url);
                              
                              if (isImage) {
                                latexSyntax = `\\includegraphics[width=\\linewidth]{${localPath}}`;
                              } else if (isPdf) {
                                latexSyntax = `\\includepdf[pages=-]{${localPath}}`;
                              } else {
                                latexSyntax = `% File: ${file.name}\n% Path: ${localPath}`;
                              }
                              
                              editor.executeEdits('insert-file', [{
                                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                                text: `\n${latexSyntax}\n`,
                              }]);
                              addToast({ title: "Inserted LaTeX syntax", variant: "success" });
                            }
                          }}
                        >
                          <div className="flex-shrink-0">
                            {isImage && <Image className="h-4 w-4 text-cyan-400 group-hover:text-cyan-300" />}
                            {isPdf && <div className="h-4 w-4 bg-red-500 rounded text-xs text-white flex items-center justify-center font-bold">PDF</div>}
                            {isDoc && <div className="h-4 w-4 bg-blue-500 rounded text-xs text-white flex items-center justify-center font-bold">DOC</div>}
                            {isTex && <div className="h-4 w-4 bg-green-500 rounded text-xs text-white flex items-center justify-center font-bold">TEX</div>}
                            {!isImage && !isPdf && !isDoc && !isTex && <div className="h-4 w-4 bg-slate-500 rounded" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-200 truncate font-medium group-hover:text-cyan-300">{file.name}</p>
                            <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="text-xs text-cyan-400 font-medium">Insert</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {/* Structure Tab */}
          {showStructure && (
            <div className="flex-1 overflow-auto">
              <div className="p-4">
                {documentStructure.length === 0 ? (
                  <div className="text-center text-slate-500 text-sm py-8">
                    <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No structure detected</p>
                    <p className="text-xs mt-1">Add sections to see structure</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {documentStructure.map((item, index) => (
                      <div
                        key={`${item.type}-${index}`}
                        className="flex items-center gap-2 p-2 rounded hover:bg-slate-700 cursor-pointer text-xs"
                        onClick={() => {
                          const editor = editorRef.current;
                          if (editor) {
                            editor.revealLineInCenter(item.line);
                            editor.setPosition({ lineNumber: item.line, column: 1 });
                            editor.focus();
                          }
                        }}
                      >
                        {item.type === 'section' && (
                          <>
                            <Hash className={`h-3 w-3 text-cyan-400`} />
                            <span className={`text-slate-200 ${item.level === 1 ? 'font-bold' : item.level === 2 ? 'pl-2' : 'pl-4'}`}>
                              {item.title}
                            </span>
                          </>
                        )}
                        {item.type === 'equation' && (
                          <>
                            <span className="font-serif italic text-purple-400">∑</span>
                            <span className="text-slate-300">{item.title}</span>
                          </>
                        )}
                        {item.type === 'figure' && (
                          <>
                            <Image className="h-3 w-3 text-green-400" />
                            <span className="text-slate-300">{item.title}</span>
                          </>
                        )}
                        {item.type === 'table' && (
                          <>
                            <Table className="h-3 w-3 text-amber-400" />
                            <span className="text-slate-300">{item.title}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* LaTeX Editor - 6 columns */}
        <div className="relative min-h-0 border-r border-slate-800 bg-[#111827] lg:col-span-6">
          <div className="flex h-10 items-center justify-between border-b border-slate-800 px-4 text-xs text-slate-400">
            <span className="font-medium">LaTeX Editor</span>
            <span className="text-xs text-green-400">Auto-save enabled</span>
          </div>

          <Editor
            height="calc(100% - 40px)"
            defaultLanguage="latex"
            theme="vs-dark"
            value={content}
            onChange={(value) => {
              const newContent = value ?? "";
              setContent(newContent);
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                void saveLecture(true);
              });
            }}
            options={{
              minimap: { enabled: true },
              wordWrap: "on",
              fontSize: 14,
              lineHeight: 22,
              smoothScrolling: true,
              scrollBeyondLastLine: false,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          />
        </div>

        {/* PDF Preview - 4 columns */}
        <div className="flex min-h-0 flex-col bg-[#0b1220] lg:col-span-4">
          <div className="flex h-10 items-center justify-between border-b border-slate-800 px-4 text-xs text-slate-400">
            <span className="font-medium text-cyan-400">Live PDF Preview</span>
            {isCompiling && (
              <span className="flex items-center gap-1 text-cyan-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Compiling
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 bg-slate-900">
            {pdfUrl ? (
              <iframe
                title="Compiled PDF"
                src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                className="h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Compile to render PDF preview
              </div>
            )}
          </div>

          <div className="h-56 border-t border-slate-800 bg-[#111827]">
            <div className="flex h-10 items-center gap-2 border-b border-slate-800 px-4 text-xs text-slate-300">
              <AlertCircle className="h-3.5 w-3.5" />
              Compile Errors
            </div>
            <div className="h-[calc(100%-40px)] overflow-auto p-3 text-xs">
              {compileErrors.length ? (
                <div className="space-y-2">
                  {compileErrors.map((errorItem, index) => (
                    <div key={`${errorItem.raw}-${index}`} className="rounded border border-red-800/40 bg-red-950/20 p-2">
                      <div className="mb-1 text-[11px] font-semibold text-red-300">
                        {errorItem.line ? `Line ${errorItem.line}` : "Unknown line"}
                      </div>
                      <div className="font-mono text-red-200">{errorItem.message}</div>
                    </div>
                  ))}
                </div>
              ) : compileLogs ? (
                <pre className="whitespace-pre-wrap font-mono text-red-200">{compileLogs}</pre>
              ) : (
                <div className="text-slate-500">No compile errors.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
