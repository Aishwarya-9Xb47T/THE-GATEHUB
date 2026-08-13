/**
 * Google Workspace Picker
 * 
 * Selection screen for Google Docs and Google Forms
 * Displays two large cards with "Open" buttons to launch native Google apps
 */

import { FileText, LayoutTemplate, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GoogleWorkspaceSource = 'google_docs' | 'google_forms';

interface WorkspaceTile {
  id: GoogleWorkspaceSource;
  label: string;
  tagline: string;
  description: string;
  icon: typeof FileText;
  accentClass: string;
  glowClass: string;
  iconBgClass: string;
  iconColorClass: string;
  url: string;
}

const WORKSPACE_SOURCES: WorkspaceTile[] = [
  {
    id: 'google_docs',
    label: 'Google Docs',
    tagline: 'Document Import',
    description: 'Create or edit Google Documents',
    icon: FileText,
    accentClass: 'hover:border-blue-400/50 hover:shadow-blue-500/10',
    glowClass: 'group-hover:shadow-[0_0_30px_rgba(59,130,246,0.08)]',
    iconBgClass: 'bg-blue-500/15 group-hover:bg-blue-500/25',
    iconColorClass: 'text-blue-400',
    url: 'https://docs.google.com',
  },
  {
    id: 'google_forms',
    label: 'Google Forms',
    tagline: 'Form Import',
    description: 'Create or edit Google Forms',
    icon: LayoutTemplate,
    accentClass: 'hover:border-green-400/50 hover:shadow-green-500/10',
    glowClass: 'group-hover:shadow-[0_0_30px_rgba(34,197,94,0.08)]',
    iconBgClass: 'bg-green-500/15 group-hover:bg-green-500/25',
    iconColorClass: 'text-green-400',
    url: 'https://forms.google.com',
  },
];

interface GoogleWorkspacePickerProps {
  onSelect: (source: GoogleWorkspaceSource) => void;
  onOpenGoogleApp: (url: string) => void;
  onBack: () => void;
}

export function GoogleWorkspacePicker({ onSelect, onOpenGoogleApp, onBack }: GoogleWorkspacePickerProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 14 14" fill="none">
            <path
              d="M11 7H3M6 4l-3 3 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Source Selection
        </button>
        
        <div className="text-center space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary/60">
            Google Workspace
          </p>
          <h2 className="text-2xl font-bold text-white leading-tight">
            Choose your source
          </h2>
          <p className="text-sm text-white/45 max-w-sm mx-auto">
            Open Google Docs or Google Forms to create or edit content, then import directly into GateHub
          </p>
        </div>
      </div>

      {/* Two-card grid */}
      <div className="grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
        {WORKSPACE_SOURCES.map((src) => {
          const Icon = src.icon;
          return (
            <div
              key={src.id}
              className={cn(
                'group relative flex flex-col gap-5 rounded-2xl border p-8 text-left',
                'border-white/10 bg-white/[0.03]',
                'transition-all duration-300',
                src.accentClass,
                src.glowClass
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  'flex h-16 w-16 items-center justify-center rounded-2xl transition-colors duration-300',
                  src.iconBgClass
                )}
              >
                <Icon className={cn('h-8 w-8', src.iconColorClass)} />
              </div>

              {/* Text */}
              <div className="space-y-2 flex-1">
                <p className="text-xs font-medium text-white/40">{src.tagline}</p>
                <p className="font-bold text-white text-xl">{src.label}</p>
                <p className="text-sm text-white/45 leading-relaxed">{src.description}</p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => onOpenGoogleApp(src.url)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                    'bg-white text-gray-900 font-medium text-sm',
                    'hover:bg-white/90 transition-colors'
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open {src.label}
                </button>
                <button
                  onClick={() => onSelect(src.id)}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg',
                    'bg-primary/20 text-primary font-medium text-sm',
                    'hover:bg-primary/30 transition-colors'
                  )}
                >
                  Import from {src.label}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footnote */}
      <p className="text-center text-[11px] text-white/25">
        Google Docs and Google Forms will open in a new tab. Return to GateHub to import your content.
      </p>
    </div>
  );
}
