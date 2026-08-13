import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ChatMessage } from '@/hooks/useStudentClassroom';

interface Props {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (text: string) => void;
  connectionStatus: 'connected' | 'disconnected' | 'recovering';
}

export function StudentChatPanel({ open, onClose, messages, currentUserId, onSend, connectionStatus }: Props) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = () => {
    if (!draft.trim() || connectionStatus !== 'connected') return;
    onSend(draft.trim());
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-white text-sm">Session Chat</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-slate-600 text-sm py-8">
                No messages yet. Say hello! 👋
              </div>
            )}
            {messages.map((msg) => {
              const isOwn = msg.userId === currentUserId;
              const isInstructor = msg.role === 'instructor';
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-start gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={msg.user.avatar} />
                    <AvatarFallback className={`text-[10px] ${isInstructor ? 'bg-violet-600' : 'bg-slate-700'}`}>
                      {msg.user.firstName[0]}{msg.user.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[200px] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                    <span className="text-[10px] text-slate-500 mb-0.5">
                      {isInstructor ? '🎓 ' : ''}{msg.user.firstName}
                      {isOwn ? ' (you)' : ''}
                    </span>
                    <div
                      className={`rounded-2xl px-3 py-1.5 text-sm break-words ${
                        isOwn
                          ? 'bg-emerald-600 text-white rounded-tr-sm'
                          : isInstructor
                            ? 'bg-violet-600/30 text-violet-100 border border-violet-500/30 rounded-tl-sm'
                            : 'bg-slate-800 text-slate-100 rounded-tl-sm'
                      }`}
                    >
                      {msg.message}
                    </div>
                    <span className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/10">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                disabled={connectionStatus !== 'connected'}
                className="bg-slate-900 border-white/10 text-slate-100 placeholder:text-slate-600 text-sm focus:border-emerald-500/50"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!draft.trim() || connectionStatus !== 'connected'}
                className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
