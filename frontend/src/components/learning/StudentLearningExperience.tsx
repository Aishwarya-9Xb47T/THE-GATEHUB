import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  ChevronRight, 
  ChevronDown, 
  Play, 
  RotateCcw, 
  ExternalLink, 
  BookOpen, 
  FileText, 
  Code2, 
  Lightbulb,
  AlertTriangle,
  Info,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InteractiveQuiz } from './InteractiveQuiz';
import { TryItPlayground } from './TryItPlayground';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { resolveCourseMediaUrl } from '@/lib/courseMediaUrls';

interface ContentBlock {
  type: 'text' | 'editor' | 'video' | 'image' | 'subsection' | 'subsubsection' | 'example' | 'output' | 'math' | 'html' | 'quiz';
  content?: string;
  language?: string;
  code?: string;
  expectedOutput?: string;
  title?: string;
  src?: string;
  alt?: string;
  filename?: string;
  id?: string;
  displayMode?: boolean;
  question?: string;
  options?: string[];
  correct?: string;
  explanation?: string;
}

interface Section {
  title: string;
  blocks: ContentBlock[];
}

interface LearningData {
  sections: Section[];
}

interface StudentLearningExperienceProps {
  data: LearningData;
  initialSectionIndex?: number;
}

/** Resolve media without persisting localhost; use same-origin / env-aware URLs. */
const resolveAssetUrl = (path: string) => {
  if (!path) return "";
  if (/^(data:|blob:)/i.test(path)) return path;
  // Absolute non-upload remotes (YouTube, etc.) stay as-is via resolver.
  const resolved = resolveCourseMediaUrl(
    path.startsWith("/uploads/") || path.startsWith("uploads/") || /^https?:\/\//i.test(path)
      ? path
      : `/uploads/resources/${path.replace(/^\//, "")}`
  );
  return resolved || "";
};

export function StudentLearningExperience({ data, initialSectionIndex = 0 }: StudentLearningExperienceProps) {
  const [activeSectionIndex, setActiveSectionIndex] = useState(initialSectionIndex);
  const [activeAnchor, setActiveAnchor] = useState<string>("");
  
  const sections = data?.sections || [];
  const activeSection = sections[activeSectionIndex];

  // Auto-scroll active item into view
  useEffect(() => {
    if (activeSectionIndex !== undefined) {
      const element = document.getElementById(`sidebar-item-${activeSectionIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeSectionIndex]);

  // Handle hash change and scroll tracking
  useEffect(() => {
    const handleScroll = () => {
      const anchors = document.querySelectorAll('.subsubsection-anchor, .subsection-anchor');
      let currentAnchor = "";
      
      anchors.forEach((anchor) => {
        const rect = anchor.getBoundingClientRect();
        if (rect.top >= 0 && rect.top <= 250) {
          currentAnchor = anchor.id;
        }
      });
      
      if (currentAnchor && currentAnchor !== activeAnchor) {
        setActiveAnchor(currentAnchor);
      }
    };

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        setActiveAnchor(hash);
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('hashchange', handleHashChange);
    
    // Initial check
    handleHashChange();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [activeAnchor]);

  const renderBlock = (block: ContentBlock, index: number) => {
    console.log("BLOCK TYPE:", block.type, block)
    switch (block.type) {
      case 'text':
      case 'html':
        return <LessonText key={index} content={block.content || ''} />;
      
      case 'editor':
        return (
          <LessonEditor 
            key={index}
            block={block}
          />
        );
      
      case "video":
        return (
          <div key={index} className="w-full my-8">
            <video
              controls
              className="w-full rounded-xl bg-black"
            >
              <source
                src={resolveAssetUrl(block.src || "")}
                type="video/mp4"
              />
            </video>
          </div>
        )
      
      case 'image':
        return <LessonImage key={index} block={block} />;
      
      case 'subsection':
        return (
          <h2 key={index} id={block.id} className="subsection-anchor text-2xl font-bold mt-12 mb-6 text-[#282a35] dark:text-white border-b-2 border-[#04AA6D] pb-2 w-fit">
            {block.title}
          </h2>
        );

      case 'subsubsection':
        return (
          <h3 key={index} id={block.id} className="subsubsection-anchor text-xl font-bold mt-8 mb-4 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-[#04AA6D] rounded-full" />
            {block.title}
          </h3>
        );
      
      case 'example':
        return <ExampleBox key={index} title={block.title || 'Example'} content={block.content || ''} />;
      
      case 'quiz':
        return (
          <InteractiveQuiz 
            key={index}
            question={block.question || ""}
            options={block.options || []}
            correct={block.correct || ""}
            explanation={block.explanation || ""}
          />
        );

      case 'output':
        return <LessonOutput key={index} content={block.content || ''} />;
      
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full bg-white dark:bg-[#111827] text-foreground overflow-hidden font-sans">
      {/* Sidebar Navigation - W3Schools Style Fixed Sidebar */}
      <aside className="w-[280px] border-r border-[#ddd] bg-[#f1f1f1] dark:bg-[#0f172a] flex flex-col shrink-0 overflow-y-auto h-full scrollbar-thin">
        <div className="p-5 border-b border-[#ddd] bg-white dark:bg-[#0f172a] sticky top-0 z-20">
          <h2 className="font-bold text-lg flex items-center gap-2 text-[#282a35] dark:text-white uppercase tracking-tighter">
            <BookOpen className="w-5 h-5 text-[#04AA6D]" />
            Learning Path
          </h2>
        </div>
        <nav className="flex-1 py-4">
          {sections.map((section, idx) => (
            <div key={idx} className="mb-1">
              <button
                id={`sidebar-item-${idx}`}
                onClick={() => {
                  setActiveSectionIndex(idx);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={cn(
                  "w-full text-left px-5 py-2.5 text-[15px] transition-all relative group flex items-center justify-between",
                  activeSectionIndex === idx 
                    ? "bg-[#04AA6D] text-white font-bold" 
                    : "text-[#282a35] dark:text-white hover:bg-[#E7E9EB] dark:hover:bg-slate-800"
                )}
              >
                <span className="truncate">{section.title}</span>
                {activeSectionIndex === idx && <ChevronRight className="w-4 h-4" />}
              </button>
              
              {/* Nested Sub-Topics (Subsections & Subsubsections) - ONLY IF ACTIVE */}
              {activeSectionIndex === idx && (
                <div className="bg-[#f1f1f1] dark:bg-slate-800/30 py-1">
                  {section.blocks?.filter(b => b.type === 'subsection' || b.type === 'subsubsection').map((sub, sIdx) => {
                    const isActive = activeAnchor === sub.id;
                    return (
                      <button 
                        key={sIdx}
                        onClick={() => {
                          const element = document.getElementById(sub.id!);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            window.history.replaceState(null, "", `#${sub.id}`);
                            setActiveAnchor(sub.id!);
                          }
                        }}
                        className={cn(
                          "w-full text-left transition-colors flex items-center gap-2",
                          sub.type === 'subsection' ? "px-8 py-2 text-[14px]" : "px-12 py-1.5 text-[13px]",
                          isActive 
                            ? "text-[#04AA6D] font-bold bg-[#E7E9EB] dark:bg-slate-700" 
                            : "text-[#555] dark:text-slate-400 hover:text-[#04AA6D] hover:bg-[#ddd] dark:hover:bg-slate-700"
                        )}
                      >
                        <span className={cn(
                          "rounded-full transition-all",
                          sub.type === 'subsection' ? "w-2 h-2" : "w-1.5 h-1.5",
                          isActive ? "bg-[#04AA6D] scale-125" : "bg-[#04AA6D] opacity-40"
                        )} />
                        {sub.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-white dark:bg-[#0f172a] selection:bg-[#fff4a3] selection:text-black scroll-smooth">
        <div className="w-full px-6 md:px-12 py-12">
          {activeSection ? (
            <div className="animate-in fade-in duration-500">
              <div className="mb-12">
                <h1 className="page-title text-foreground mb-4">{activeSection.title}</h1>
                <div className="h-2 w-20 bg-[#04AA6D] rounded-full" />
              </div>

              {/* Render Content Blocks */}
              <div className="prose prose-slate dark:prose-invert max-w-none 
                prose-p:text-[18px] prose-p:leading-relaxed prose-p:text-[#282a35] dark:prose-p:text-slate-300
                prose-a:text-[#04AA6D] prose-a:no-underline hover:prose-a:underline
                prose-strong:text-[#282a35] dark:prose-strong:text-white">
                {activeSection.blocks?.map((block, index) => renderBlock(block, index))}
              </div>

              {/* Navigation Buttons like W3Schools */}
              <div className="mt-20 pt-12 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-6">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto rounded-md px-10 py-7 font-bold text-lg border-2 hover:bg-[#04AA6D] hover:text-white hover:border-[#04AA6D] transition-all"
                  disabled={activeSectionIndex === 0}
                  onClick={() => {
                    setActiveSectionIndex(prev => prev - 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  ❮ Previous
                </Button>
                
                <Button
                  className="w-full sm:w-auto rounded-md px-10 py-7 font-bold text-lg bg-[#04AA6D] hover:bg-[#059862] text-white transition-all shadow-lg shadow-emerald-500/20"
                  disabled={activeSectionIndex === sections.length - 1}
                  onClick={() => {
                    setActiveSectionIndex(prev => prev + 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Next ❯
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
              <BookOpen className="w-20 h-20 mb-6 text-[#04AA6D] opacity-20" />
              <h2 className="text-2xl font-bold mb-2 text-foreground">Welcome to the Learning Hub</h2>
              <p className="text-lg opacity-60">Select a section from the sidebar to begin.</p>
            </div>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .subsection-anchor, .subsubsection-anchor {
          scroll-margin-top: 40px;
        }
        .w3-example-box {
          margin: 32px 0;
        }
        /* Scrollbar styling for sidebar */
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 10px;
        }
        .dark .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #334155;
        }
      `}} />
    </div>
  );
}

function LessonText({ content }: { content: string }) {
  return (
    <div 
      className="prose-content mb-8 text-[18px] leading-relaxed text-[#282a35] dark:text-slate-300" 
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
    />
  );
}

function LessonImage({ block }: { block: ContentBlock }) {
  const url = resolveAssetUrl(block.src || block.filename || "");
  return (
    <div className="my-10">
      <img 
        src={url} 
        alt={block.alt || ""} 
        style={{ 
          width: "100%", 
          borderRadius: "14px", 
          marginTop: "20px",
          display: "block",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
        }}
      />
    </div>
  );
}

function LessonVideo({ block }: { block: ContentBlock }) {
  const url = resolveAssetUrl(block.src || block.filename || "");
  
  return (
    <div className="my-10">
      <video 
        controls 
        width="100%"
        style={{ 
          borderRadius: "14px", 
          background: "#000",
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
        }}
      >
        <source src={url} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}

interface LessonEditorProps {
  block: ContentBlock;
}

function LessonEditor({ block }: LessonEditorProps) {
  return (
    <TryItPlayground
      initialCode={block.code || ""}
      language={block.language || "javascript"}
      title={block.title || "Try It Yourself"}
      expectedOutput={block.expectedOutput}
      showHintsToggle={false}
      showSolutionToggle={false}
    />
  );
}

function ExampleBox({ title, content }: { title: string; content: string }) {
  return (
    <div className="my-10 rounded-lg overflow-hidden border border-[#ddd] dark:border-slate-700 shadow-sm">
      <div className="px-5 py-3 bg-[#E7E9EB] dark:bg-[#2d3748] border-b border-[#ddd] dark:border-slate-700">
        <h3 className="text-lg font-bold text-[#282a35] dark:text-white">{title}</h3>
      </div>
      <div className="p-6 bg-white dark:bg-slate-900">
        <LessonText content={content} />
      </div>
    </div>
  );
}

function LessonOutput({ content }: { content: string }) {
  return (
    <div className="my-8 rounded-lg overflow-hidden border border-[#333] bg-[#1e1e1e] shadow-lg">
      <div className="px-4 py-2 bg-[#2d2d2d] border-b border-[#333]">
        <span className="text-[10px] font-bold text-[#888] uppercase tracking-widest">Console</span>
      </div>
      <div className="p-6 font-mono text-[15px] text-[#00ff88] leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}



// Educational Components for Main Content
export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 p-4 rounded-xl bg-emerald-500/5 border-l-4 border-emerald-500 flex gap-4">
      <div className="bg-emerald-500/10 p-2 rounded-lg h-fit">
        <Lightbulb className="w-5 h-5 text-emerald-600" />
      </div>
      <div>
        <div className="font-bold text-emerald-800 text-sm uppercase tracking-widest mb-1">Expert Tip</div>
        <div className="text-emerald-900/80 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 p-4 rounded-xl bg-amber-500/5 border-l-4 border-amber-500 flex gap-4">
      <div className="bg-amber-500/10 p-2 rounded-lg h-fit">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
      </div>
      <div>
        <div className="font-bold text-amber-800 text-sm uppercase tracking-widest mb-1">Watch Out</div>
        <div className="text-amber-900/80 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 p-4 rounded-xl bg-blue-500/5 border-l-4 border-blue-500 flex gap-4">
      <div className="bg-blue-500/10 p-2 rounded-lg h-fit">
        <Info className="w-5 h-5 text-blue-600" />
      </div>
      <div>
        <div className="font-bold text-blue-800 text-sm uppercase tracking-widest mb-1">Note</div>
        <div className="text-blue-900/80 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
