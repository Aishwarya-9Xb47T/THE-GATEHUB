import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, Send, CheckCircle, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { StudentQuestion } from '@/hooks/useStudentClassroom';

interface Props {
  open: boolean;
  onClose: () => void;
  questions: StudentQuestion[];
  currentUserId: string;
  onSubmit: (text: string) => Promise<void>;
  connectionStatus: 'connected' | 'disconnected' | 'recovering';
}

export function StudentQuestionsPanel({ open, onClose, questions, currentUserId, onSubmit, connectionStatus }: Props) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(draft.trim());
      setDraft('');
    } finally {
      setSubmitting(false);
    }
  };

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
              <HelpCircle className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-white text-sm">Ask a Question</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Question input */}
          <div className="p-4 border-b border-white/10 space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask your instructor something…"
              rows={3}
              className="bg-slate-900 border-white/10 text-slate-100 placeholder:text-slate-600 text-sm resize-none focus:border-blue-500/50"
            />
            <Button
              onClick={handleSubmit}
              disabled={!draft.trim() || submitting || connectionStatus !== 'connected'}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              {submitting ? 'Sending…' : 'Send Question'}
            </Button>
          </div>

          {/* Question list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {questions.length === 0 && (
              <p className="text-center text-slate-600 text-sm py-4">No questions yet</p>
            )}
            {questions.map((q) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl p-3 border ${
                  q.isResolved
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : q.isPinned
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-slate-900 border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-[11px] text-slate-400">
                    {q.userId === currentUserId ? 'You' : `${q.user.firstName} ${q.user.lastName}`}
                  </span>
                  <div className="flex items-center gap-1">
                    {q.isPinned && <Pin className="w-3 h-3 text-amber-400" />}
                    {q.isResolved && <CheckCircle className="w-3 h-3 text-emerald-400" />}
                  </div>
                </div>
                <p className="text-sm text-slate-200">{q.text}</p>
                {q.isResolved && (
                  <Badge className="mt-2 text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    Answered
                  </Badge>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
