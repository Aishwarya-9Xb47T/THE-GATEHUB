import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StickyNote, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onClose: () => void;
  slideTitle: string;
  noteText: string;
  onSave: (text: string) => void;
}

export function StudentNotesPanel({ open, onClose, slideTitle, noteText, onSave }: Props) {
  const handleDownload = useCallback(() => {
    const blob = new Blob([noteText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${slideTitle.replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [noteText, slideTitle]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 320 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 320 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-0 w-80 z-40 bg-slate-950 border-l border-white/10 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-violet-400" />
              <span className="font-semibold text-white text-sm">My Notes</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleDownload} className="h-7 w-7 text-slate-400 hover:text-white">
                <Download className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Slide context */}
          <div className="px-4 py-2 bg-violet-500/10 border-b border-violet-500/20">
            <p className="text-xs text-violet-300 truncate">
              📌 {slideTitle}
            </p>
          </div>

          {/* Notes textarea */}
          <div className="flex-1 p-4">
            <Textarea
              value={noteText}
              onChange={(e) => onSave(e.target.value)}
              placeholder="Write your private notes here… (auto-saved)"
              className="h-full resize-none bg-slate-900 border-white/10 text-slate-100 placeholder:text-slate-600 focus:border-violet-500/50 text-sm"
            />
          </div>

          <div className="px-4 pb-4">
            <p className="text-xs text-slate-600 text-center">Private • Auto-saved per slide</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
