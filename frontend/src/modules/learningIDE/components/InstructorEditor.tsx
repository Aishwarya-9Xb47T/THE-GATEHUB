import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Settings, BookOpen, Play, Save, Loader2, AlertCircle, Image, Upload, FileText, PanelLeft, PanelLeftClose } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';

interface ResourceContent {
  id: string;
  courseId: string;
  latexContent: string;
  compiledHtml: string;
  pdfUrl?: string;
  updatedAt: string;
}

interface CompileError {
  message: string;
  line: number | null;
  raw: string;
}

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

interface ResourceCourse {
  id: string;
  title: string;
  description?: string;
  instructorId: string;
  content?: ResourceContent;
}

export default function InstructorEditor() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<ResourceCourse | null>(null);
  const [latexContent, setLatexContent] = useState('');
  const [compiledHtml, setCompiledHtml] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [compileErrors, setCompileErrors] = useState<CompileError[]>([]);
  const [compileLogs, setCompileLogs] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showFileTree, setShowFileTree] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const editorRef = useRef<any>(null);
  const token = useAuthStore((state) => state.token);
  const addToast = useToastStore((state) => state.add);

  useEffect(() => {
    if (!courseId) {
      navigate('/resources/instructor/dashboard');
      return;
    }

    loadCourseAndContent();
  }, [courseId, navigate]);

  const loadCourseAndContent = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const courseResponse = await fetch(`/api/resources/courses/${courseId}`);
      if (!courseResponse.ok) {
        throw new Error('Course not found');
      }

      const courseData: ResourceCourse = await courseResponse.json();
      setCourse(courseData);

      // Load content if it exists
      if (courseData.content) {
        setLatexContent(courseData.content.latexContent);
        setCompiledHtml(courseData.content.compiledHtml);
      } else {
        // Initialize with template
        const template = `# ${courseData.title}

## Introduction
Welcome to this learning resource!

## Section 1: Getting Started

### Basic Concepts
Here are some fundamental concepts:

- First concept
- Second concept
- Third concept

### Mathematical Example
Here's a mathematical expression:

$$E = mc^2$$

And here's an inline expression: $x^2 + y^2 = z^2$

## Section 2: Advanced Topics

### Code Example
\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

### More Math
The quadratic formula:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

## Conclusion
This concludes our learning resource.
`;
        setLatexContent(template);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to load course');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save functionality
  useEffect(() => {
    const timer = setTimeout(() => {
      if (latexContent && latexContent !== course?.content?.latexContent) {
        saveContent();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [latexContent, course?.content?.latexContent]);

  const handleContentChange = (value: string | undefined) => {
    const newContent = value ?? "";
    setLatexContent(newContent);
  };

  const saveContent = async () => {
    if (!courseId || isSaving) return;
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/resources/content/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          courseId,
          latexContent: latexContent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save content');
      }

      const data: ResourceContent = await response.json();
      setCompiledHtml(data.compiledHtml);
      setLastSaved(new Date());
    } catch (error: any) {
      addToast({
        title: "Save failed",
        description: error?.message || "Could not save content",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Real LaTeX compilation
  const compileLatex = useCallback(async (notify = true) => {
    if (!token) {
      if (notify) {
        addToast({
          title: "Authentication required",
          description: "Please log in to compile LaTeX",
          variant: "destructive",
        });
      }
      return;
    }

    const currentContent = editorRef.current?.getValue() || latexContent;
    setIsCompiling(true);
    setCompileErrors([]);
    setCompileLogs(null);

    try {
      // Save before compiling
      await saveContent();

      const response = await fetch('/api/latex/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: currentContent,
          projectId: courseId,
          force: true
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setCompileErrors(data.errors || []);
        setCompileLogs(data.logs || data.error || 'Compilation failed');
        if (notify) {
          addToast({
            title: "Compilation failed",
            description: data.error || "Fix the LaTeX errors and retry",
            variant: "destructive",
          });
        }
        return;
      }

      // Handle PDF response
      if (data.pdfBase64) {
        const pdfBlob = new Blob([Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfUrl(pdfUrl);
      } else if (data.fileUrl) {
        setPdfUrl(data.fileUrl);
      }

      setCompileErrors([]);
      setCompileLogs(null);

      if (notify) {
        addToast({
          title: "Compilation successful",
          variant: "success",
        });
      }
    } catch (error: any) {
      setCompileLogs(error?.message || "Compilation request failed");
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
  }, [token, courseId, latexContent, addToast]);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      addToast({ title: `${isImage ? 'Image' : 'Document'} uploaded successfully`, variant: "success" });
    } catch (error: any) {
      addToast({ title: "File upload failed", variant: "destructive" });
    }
    
    event.target.value = '';
  }, [token, addToast]);

  // Insert file reference into editor
  const insertFileReference = useCallback((file: UploadedFile) => {
    const editor = editorRef.current;
    if (!editor) return;

    const position = editor.getPosition();
    const localPath = file.url.replace(/https?:\/\/[^\/]+/, '.');
    
    let latexSyntax = '';
    if (file.type.startsWith('image/')) {
      latexSyntax = `\\includegraphics[width=\\linewidth]{${localPath}}`;
    } else if (file.name.endsWith('.pdf')) {
      latexSyntax = `\\includepdf[pages=-]{${localPath}}`;
    } else {
      latexSyntax = `% File: ${file.name}\n% Path: ${localPath}`;
    }

    editor.executeEdits('insert-file', [{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      },
      text: `\n${latexSyntax}\n`,
    }]);
    
    addToast({ title: "File reference inserted", variant: "success" });
  }, [addToast]);

  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400">{error || 'Course not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-700 bg-[#1e293b]/95 backdrop-blur">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/resources/instructor/dashboard')}
                className="text-slate-400 hover:text-slate-100 transition-colors"
              >
                ← Back to Dashboard
              </button>
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-blue-400" />
                <h1 className="text-xl font-semibold">{course.title}</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Save Status */}
              <div className="flex items-center space-x-2 text-sm">
                {isSaving && (
                  <div className="flex items-center space-x-2 text-yellow-400">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                    <span>Saving...</span>
                  </div>
                )}
                {lastSaved && !isSaving && (
                  <div className="flex items-center space-x-2 text-green-400">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Saved {lastSaved.toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
              
              <button
                onClick={() => setShowFileTree(!showFileTree)}
                className="p-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                title="Toggle File Explorer"
              >
                {showFileTree ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
              </button>

              <button
                onClick={saveContent}
                disabled={isSaving}
                className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-600 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </button>
              
              <button
                onClick={() => compileLatex(true)}
                disabled={isCompiling}
                className="flex items-center space-x-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-600 transition-colors"
              >
                {isCompiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>{isCompiling ? 'Compiling...' : 'Compile'}</span>
              </button>

              {/* Preview Toggle */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                {showPreview ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                <span>{showPreview ? 'Hide' : 'Show'} Preview</span>
              </button>
              
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  download={`${course.title}-notes.pdf`}
                  className="flex items-center space-x-2 px-3 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download PDF</span>
                </a>
              )}

              <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Editor and Preview */}
      <div className="flex h-[calc(100vh-80px)] overflow-hidden">
        {/* File Manager Sidebar */}
        {showFileTree && (
          <div className="w-64 border-r border-slate-700 bg-[#1e293b] flex flex-col">
            <div className="px-4 py-3 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-200">Files</h3>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt,.tex"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Upload className="w-4 h-4 text-slate-400 hover:text-slate-200" />
                </label>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {uploadedFiles.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-8">
                  <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No files uploaded</p>
                  <p className="text-xs mt-1">Upload images or documents</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {uploadedFiles.map((file) => {
                    const isImage = file.type.startsWith('image/');
                    const isPdf = file.name.endsWith('.pdf');
                    
                    return (
                      <div
                        key={file.id}
                        className="group flex items-center gap-2 p-2 rounded hover:bg-slate-700 cursor-pointer border border-transparent hover:border-slate-600 transition-all"
                        onClick={() => insertFileReference(file)}
                      >
                        <div className="flex-shrink-0">
                          {isImage && <Image className="w-4 h-4 text-cyan-400" />}
                          {isPdf && <FileText className="w-4 h-4 text-red-400" />}
                          {!isImage && !isPdf && <FileText className="w-4 h-4 text-slate-400" />}
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
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* LaTeX Editor */}
        <div className={`${showPreview ? 'w-1/2' : 'w-full'} border-r border-slate-700 flex flex-col bg-[#0f172a]`}>
          <div className="px-4 py-3 bg-[#1e293b] border-b border-slate-700">
            <h3 className="font-medium text-slate-200">LaTeX Editor</h3>
            <p className="text-sm text-slate-400">Write LaTeX content</p>
          </div>
          <Editor
            height="calc(100% - 40px)"
            defaultLanguage="latex"
            theme="vs-dark"
            value={latexContent}
            onChange={handleContentChange}
            onMount={(editor) => {
              editorRef.current = editor;
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

        {/* PDF Preview */}
        {showPreview && (
          <div className="w-1/2 flex flex-col bg-[#0b1220]">
            <div className="px-4 py-3 bg-[#1e293b] border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <Eye className="w-4 h-4 text-slate-400" />
                <h3 className="font-medium text-slate-200">PDF Preview</h3>
                {isCompiling && (
                  <span className="flex items-center gap-1 text-cyan-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Compiling
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex-1 bg-slate-900">
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

            {/* Compile Errors Panel */}
            <div className="h-56 border-t border-slate-700 bg-[#1e293b]">
              <div className="flex h-10 items-center gap-2 border-b border-slate-700 px-4 text-xs text-slate-300">
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
        )}
      </div>
    </div>
  );
}
