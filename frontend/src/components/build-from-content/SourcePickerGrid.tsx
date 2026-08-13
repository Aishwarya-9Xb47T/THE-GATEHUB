/**
 * SourcePickerGrid
 *
 * Redesigned 3-card source picker.
 * Philosophy: Users are building quizzes from learning material — not importing files.
 *
 * Three primary sources only:
 *   1. Learning Material  (PDF, DOCX, PPTX, TXT, Markdown, CSV, Excel, Images)
 *   2. Google Workspace   (Docs, Forms, Slides, Drive)
 *   3. Paste Text         (Notes, excerpts, Q&A)
 *
 * Website URL and YouTube are secondary — removed from this screen.
 */

import { useRef } from 'react';
import { BookOpen, AlignLeft, Chrome } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ContentSource =
  | 'learning_material'
  | 'paste_text'
  | 'cloud_workspace';

interface SourceTile {
  id: ContentSource;
  label: string;
  tagline: string;
  description: string;
  icon: typeof BookOpen;
  formats: string[];
  accentClass: string;
  glowClass: string;
  iconBgClass: string;
  iconColorClass: string;
}

const SOURCES: SourceTile[] = [
  {
    id: 'learning_material',
    label: 'Learning Material',
    tagline: 'Your study content',
    description: 'Upload any file — GateHub reads and converts it.',
    icon: BookOpen,
    formats: ['PDF', 'DOCX', 'TXT'],
    accentClass: 'hover:border-amber-400/50 hover:shadow-amber-500/10',
    glowClass: 'group-hover:shadow-[0_0_30px_rgba(251,191,36,0.08)]',
    iconBgClass: 'bg-amber-500/15 group-hover:bg-amber-500/25',
    iconColorClass: 'text-amber-400',
  },
  {
    id: 'cloud_workspace',
    label: 'Cloud Workspace',
    tagline: 'Google Drive & More',
    description: 'Browse Google Docs, Forms, Slides — all inside GateHub.',
    icon: Chrome,
    formats: ['Google Docs', 'Google Forms', 'Google Slides'],
    accentClass: 'hover:border-sky-400/50 hover:shadow-sky-500/10',
    glowClass: 'group-hover:shadow-[0_0_30px_rgba(56,189,248,0.08)]',
    iconBgClass: 'bg-sky-500/15 group-hover:bg-sky-500/25',
    iconColorClass: 'text-sky-400',
  },
  {
    id: 'paste_text',
    label: 'Paste Text',
    tagline: 'Any raw content',
    description: 'Paste notes, textbook excerpts, or Q&A directly.',
    icon: AlignLeft,
    formats: ['Notes', 'Excerpts', 'Study Guides', 'Q&A Text'],
    accentClass: 'hover:border-violet-400/50 hover:shadow-violet-500/10',
    glowClass: 'group-hover:shadow-[0_0_30px_rgba(167,139,250,0.08)]',
    iconBgClass: 'bg-violet-500/15 group-hover:bg-violet-500/25',
    iconColorClass: 'text-violet-400',
  },
];

interface SourcePickerGridProps {
  onSelect: (source: ContentSource) => void;
}

export function SourcePickerGrid({ onSelect }: SourcePickerGridProps) {
  return (
    <div className="space-y-8">
      {/* Hero heading */}
      <div className="text-center space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary/60">
          Build from Content
        </p>
        <h2 className="text-2xl font-bold text-white leading-tight">
          Where is your learning material?
        </h2>
        <p className="text-sm text-white/45 max-w-sm mx-auto">
          GateHub will extract assessment questions automatically and prepare them for review.
        </p>
      </div>

      {/* Three-card grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {SOURCES.map((src) => {
          const Icon = src.icon;
          return (
            <button
              key={src.id}
              type="button"
              onClick={() => onSelect(src.id)}
              className={cn(
                'group relative flex flex-col gap-4 rounded-2xl border p-6 text-left',
                'border-white/10 bg-white/[0.03]',
                'transition-all duration-300 outline-none',
                'hover:bg-white/[0.07] hover:shadow-xl',
                'focus-visible:ring-2 focus-visible:ring-primary/60',
                src.accentClass,
                src.glowClass
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-300',
                  src.iconBgClass
                )}
              >
                <Icon className={cn('h-6 w-6', src.iconColorClass)} />
              </div>

              {/* Text */}
              <div className="space-y-1.5 flex-1">
                <p className="text-xs font-medium text-white/40">{src.tagline}</p>
                <p className="font-bold text-white text-base">{src.label}</p>
                <p className="text-xs text-white/45 leading-relaxed">{src.description}</p>
              </div>

              {/* Format pills */}
              <div className="flex flex-wrap gap-1.5">
                {src.formats.map((f) => (
                  <span
                    key={f}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium border',
                      'bg-white/5 border-white/10 text-white/35',
                      'group-hover:bg-white/10 group-hover:text-white/55 transition-colors duration-300'
                    )}
                  >
                    {f}
                  </span>
                ))}
              </div>

              {/* Arrow indicator */}
              <div
                className={cn(
                  'absolute right-5 top-5 flex h-7 w-7 items-center justify-center rounded-full',
                  'border border-white/10 text-white/20',
                  'group-hover:border-white/30 group-hover:text-white/60 transition-all duration-300',
                  'group-hover:translate-x-0.5'
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 7h8M8 4l3 3-3 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footnote */}
      <p className="text-center text-[11px] text-white/25">
        All sources produce the same output — an Assessment Document ready for Quiz Builder
      </p>
    </div>
  );
}
