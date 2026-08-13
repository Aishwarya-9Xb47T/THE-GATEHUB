import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hand,
  StickyNote,
  MessageSquare,
  HelpCircle,
  Bookmark,
  Maximize2,
  Minimize2,
  Smile,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  raisedHand: boolean;
  onRaiseHand: () => void;
  notesOpen: boolean;
  onToggleNotes: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  unreadChat: number;
  questionsOpen: boolean;
  onToggleQuestions: () => void;
  isCurrentSlideBookmarked: boolean;
  onToggleBookmark: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  reactionsOpen: boolean;
  onToggleReactions: () => void;
  onReaction: (emoji: string) => void;
}

const REACTIONS = ['👍', '👏', '❤️', '😄', '❓', '🔥', '😮'];

function ToolbarBtn({
  id,
  onClick,
  active,
  activeClass,
  title,
  children,
}: {
  id: string;
  onClick: () => void;
  active?: boolean;
  activeClass?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      id={id}
      variant="ghost"
      size="icon"
      onClick={onClick}
      title={title}
      className={`h-10 w-10 rounded-xl transition-all ${
        active
          ? activeClass || 'bg-violet-500/20 text-violet-300'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </Button>
  );
}

export function StudentBottomToolbar({
  raisedHand,
  onRaiseHand,
  notesOpen,
  onToggleNotes,
  chatOpen,
  onToggleChat,
  unreadChat,
  questionsOpen,
  onToggleQuestions,
  isCurrentSlideBookmarked,
  onToggleBookmark,
  isFullscreen,
  onToggleFullscreen,
  reactionsOpen,
  onToggleReactions,
  onReaction,
}: Props) {
  return (
    <div className="border-t border-white/10 bg-slate-950/95 backdrop-blur-sm px-4 py-2">
      <div className="flex items-center justify-center gap-1 md:gap-2 flex-wrap">
        {/* Raise Hand */}
        <Button
          id="sc-raise-hand"
          variant={raisedHand ? 'default' : 'ghost'}
          size="icon"
          onClick={onRaiseHand}
          title={raisedHand ? 'Lower hand' : 'Raise hand'}
          className={`h-10 w-10 rounded-xl transition-all ${
            raisedHand
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30'
              : 'text-slate-300 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Hand className="w-5 h-5" />
        </Button>

        <div className="w-px h-6 bg-white/10" />

        {/* Notes */}
        <ToolbarBtn
          id="sc-notes"
          onClick={onToggleNotes}
          active={notesOpen}
          activeClass="bg-violet-500/20 text-violet-300"
          title="My notes"
        >
          <StickyNote className="w-5 h-5" />
        </ToolbarBtn>

        {/* Bookmark */}
        <ToolbarBtn
          id="sc-bookmark"
          onClick={onToggleBookmark}
          active={isCurrentSlideBookmarked}
          activeClass="text-amber-400 bg-amber-400/10"
          title={isCurrentSlideBookmarked ? 'Remove bookmark' : 'Bookmark slide'}
        >
          <Bookmark className={`w-5 h-5 ${isCurrentSlideBookmarked ? 'fill-current' : ''}`} />
        </ToolbarBtn>

        {/* Ask Question */}
        <ToolbarBtn
          id="sc-questions"
          onClick={onToggleQuestions}
          active={questionsOpen}
          activeClass="bg-blue-500/20 text-blue-300"
          title="Ask a question"
        >
          <HelpCircle className="w-5 h-5" />
        </ToolbarBtn>

        {/* Chat */}
        <div className="relative">
          <ToolbarBtn
            id="sc-chat"
            onClick={onToggleChat}
            active={chatOpen}
            activeClass="bg-emerald-500/20 text-emerald-300"
            title="Session chat"
          >
            <MessageSquare className="w-5 h-5" />
          </ToolbarBtn>
          {unreadChat > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] bg-red-500 text-white border-0 pointer-events-none">
              {unreadChat > 9 ? '9+' : unreadChat}
            </Badge>
          )}
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Emoji Reactions */}
        <div className="relative">
          <ToolbarBtn
            id="sc-reactions"
            onClick={onToggleReactions}
            active={reactionsOpen}
            activeClass="bg-pink-500/20 text-pink-300"
            title="React"
          >
            <Smile className="w-5 h-5" />
          </ToolbarBtn>

          <AnimatePresence>
            {reactionsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-1 bg-slate-900 border border-white/15 rounded-2xl p-2 shadow-2xl z-50"
              >
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReaction(emoji);
                      onToggleReactions();
                    }}
                    className="text-2xl hover:scale-125 transition-transform w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Fullscreen */}
        <ToolbarBtn
          id="sc-fullscreen"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </ToolbarBtn>
      </div>
    </div>
  );
}
