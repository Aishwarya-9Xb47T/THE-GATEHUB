/**
 * PasteTextInput
 * Premium paste text entry — notes, excerpts, Q&A, study guides.
 */

import { useState } from 'react';
import { AlignLeft, ArrowLeft, ArrowRight, Hash, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PasteTextInputProps {
  onSubmit: (text: string) => void;
  onBack: () => void;
}

const MIN_CHARS = 50;

export function PasteTextInput({ onSubmit, onBack }: PasteTextInputProps) {
  const [text, setText] = useState('');

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const isReady = text.trim().length >= MIN_CHARS;
  const fillPercent = Math.min(100, (charCount / 500) * 100);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <AlignLeft className="h-5 w-5 text-violet-400" />
            <h3 className="font-bold text-white text-lg">Paste Text</h3>
          </div>
          <p className="text-xs text-white/40 mt-0.5">
            Notes, textbook excerpts, study guides, or any Q&amp;A content
          </p>
        </div>
      </div>

      {/* Textarea wrapper */}
      <div
        className={cn(
          'relative rounded-2xl border transition-all duration-300',
          isReady
            ? 'border-violet-500/40 shadow-[0_0_20px_rgba(167,139,250,0.07)]'
            : 'border-white/10'
        )}
      >
        {/* Subtle inner glow when ready */}
        {isReady && (
          <div className="absolute inset-0 rounded-2xl bg-violet-500/[0.03] pointer-events-none" />
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your learning material here — notes, textbook content, Q&A, study guides…"
          rows={12}
          autoFocus
          className={cn(
            'w-full rounded-2xl bg-white/[0.03] px-5 py-4 text-sm text-white leading-relaxed',
            'placeholder:text-white/20 outline-none resize-none',
            'transition-colors duration-200'
          )}
        />

        {/* Progress bar at bottom */}
        <div className="h-[2px] mx-4 mb-3 rounded-full bg-white/5 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isReady ? 'bg-violet-500' : 'bg-white/20'
            )}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5 text-xs text-white/35">
          <Type className="h-3.5 w-3.5" />
          <span>{charCount.toLocaleString()} characters</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/35">
          <Hash className="h-3.5 w-3.5" />
          <span>{wordCount.toLocaleString()} words</span>
        </div>
        {!isReady && charCount > 0 && (
          <span className="ml-auto text-xs text-white/25">
            {MIN_CHARS - text.trim().length} more characters needed
          </span>
        )}
        {isReady && (
          <span className="ml-auto text-xs text-violet-400 font-medium">Ready to analyse</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-white/50 hover:text-white hover:bg-white/8"
        >
          Back
        </Button>
        <Button
          className={cn(
            'ml-auto gap-2 px-6 font-semibold transition-all',
            isReady
              ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          )}
          disabled={!isReady}
          onClick={() => onSubmit(text.trim())}
        >
          Analyse Content
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
