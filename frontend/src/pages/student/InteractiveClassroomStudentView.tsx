/**
 * Student Classroom Page
 *
 * The complete, immersive student live-learning experience.
 * This is NOT the Quiz Room. This is NOT the existing student dashboard.
 * This is the dedicated live synchronized classroom for the Interactive Classroom module.
 *
 * Architecture:
 *  - useStudentClassroom() handles all state + WS
 *  - SlideRenderer (shared, read-only) renders slides
 *  - StudentInteractionPanel (shared) renders polls/quizzes
 *  - All other components are student-classroom specific
 *
 * Instructor experience is UNTOUCHED — this file does not affect it.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudentClassroom } from '@/hooks/useStudentClassroom';
import { getUserIdFromToken } from '@/lib/auth';

// Student-classroom specific components
import { StudentClassroomHeader } from '@/components/student-classroom/StudentClassroomHeader';
import { StudentSlideViewer } from '@/components/student-classroom/StudentSlideViewer';
import { StudentBottomToolbar } from '@/components/student-classroom/StudentBottomToolbar';
import { StudentNotesPanel } from '@/components/student-classroom/StudentNotesPanel';
import { StudentChatPanel } from '@/components/student-classroom/StudentChatPanel';
import { StudentQuestionsPanel } from '@/components/student-classroom/StudentQuestionsPanel';

// Floating emoji reaction animation
function FloatingReaction({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: -120, scale: 1.4 }}
      transition={{ duration: 2.2, ease: 'easeOut' }}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 text-6xl pointer-events-none z-50 select-none"
    >
      {emoji}
    </motion.div>
  );
}

export function InteractiveClassroomStudentView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const classroom = useStudentClassroom({ sessionId: sessionId || '' });

  // Panel state (only one open at a time for clean UX on mobile)
  const [activePanel, setActivePanel] = useState<'notes' | 'chat' | 'questions' | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);

  // Floating reaction animations
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string }>>([]);

  const openPanel = (panel: 'notes' | 'chat' | 'questions') => {
    setActivePanel((prev) => (prev === panel ? null : panel));
    setReactionsOpen(false);
    if (panel === 'chat') classroom.openChat();
  };

  const closePanel = () => {
    setActivePanel(null);
    classroom.closeChat();
  };

  const handleReaction = (emoji: string) => {
    classroom.sendReaction(emoji);
    const id = Math.random().toString(36).slice(2);
    setFloatingReactions((prev) => [...prev, { id, emoji }]);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePanel(null);
        setReactionsOpen(false);
        if (document.fullscreenElement) document.exitFullscreen();
      }
      if (e.key === 'ArrowRight' && classroom.canGoNext) classroom.selfNavigate('next');
      if (e.key === 'ArrowLeft' && classroom.canGoPrev) classroom.selfNavigate('previous');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [classroom]);

  // ── Loading state
  if (classroom.loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mx-auto">
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
            <div className="absolute inset-0 rounded-full border-4 border-violet-500/30 animate-ping" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg">Joining classroom…</h2>
            <p className="text-slate-400 text-sm mt-1">Connecting to session</p>
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto" />
        </div>
      </div>
    );
  }

  // ── Session ended
  if (classroom.sessionEnded) {
    if (classroom.resolvedSessionId) {
      navigate(`/student/classroom/session-end/${classroom.resolvedSessionId}`, { replace: true });
    }
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="text-7xl">🎓</div>
          <h1 className="text-3xl font-bold text-white">Session Ended</h1>
          <p className="text-slate-400">The instructor has ended this classroom session.</p>
          <Button onClick={() => navigate('/student/classroom')} className="bg-violet-600 hover:bg-violet-700 text-white">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ── Session not found
  if (!classroom.viewData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="text-6xl">❌</div>
          <h1 className="text-2xl font-bold text-white">Session Not Found</h1>
          <p className="text-slate-400">This session may have ended or does not exist.</p>
          <Button onClick={() => navigate('/student/classroom')} variant="outline" className="border-white/20 text-white">
            Back to Classroom
          </Button>
        </div>
      </div>
    );
  }

  const { viewData } = classroom;
  const currentUserId = getUserIdFromToken() || '';
  const slideInfo = classroom.currentSlide
    ? `${classroom.currentIndex + 1} / ${classroom.totalSlides}`
    : undefined;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <StudentClassroomHeader
        title={viewData.session.title || viewData.presentation.title}
        presentationTitle={viewData.presentation.title}
        instructorName={`${viewData.instructor.firstName} ${viewData.instructor.lastName}`}
        roomCode={viewData.session.roomCode}
        connectionStatus={classroom.connectionStatus}
        slideInfo={slideInfo}
        onLeave={() => navigate('/student/classroom')}
      />

      {/* Main content area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Slide viewer (always full area) */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <StudentSlideViewer
            currentSlide={classroom.currentSlide}
            currentIndex={classroom.currentIndex}
            totalSlides={classroom.totalSlides}
            navigation={classroom.navigation}
            pointer={classroom.pointer}
            activeInteraction={classroom.activeInteraction}
            submission={classroom.submission}
            revealed={classroom.revealed}
            canGoPrev={classroom.canGoPrev}
            canGoNext={classroom.canGoNext}
            onPrev={() => classroom.selfNavigate('previous')}
            onNext={() => classroom.selfNavigate('next')}
            onInteractionSubmit={classroom.submitInteraction}
            connectionStatus={classroom.connectionStatus}
            pollResults={classroom.pollResults}
            remainingSeconds={classroom.pollRemaining}
            presentationId={classroom.viewData?.presentation.id}
          />
        </div>

        {/* Slide-out panels (notes / chat / questions) */}
        <AnimatePresence mode="wait">
          {activePanel === 'notes' && (
            <StudentNotesPanel
              key="notes"
              open
              onClose={closePanel}
              slideTitle={classroom.currentSlide?.title || 'Slide'}
              noteText={classroom.noteText}
              onSave={classroom.saveNote}
            />
          )}
          {activePanel === 'chat' && (
            <StudentChatPanel
              key="chat"
              open
              onClose={closePanel}
              messages={classroom.chatMessages}
              currentUserId={currentUserId}
              onSend={classroom.sendChatMessage}
              connectionStatus={classroom.connectionStatus}
            />
          )}
          {activePanel === 'questions' && (
            <StudentQuestionsPanel
              key="questions"
              open
              onClose={closePanel}
              questions={classroom.questions}
              currentUserId={currentUserId}
              onSubmit={classroom.submitQuestion}
              connectionStatus={classroom.connectionStatus}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Bottom toolbar */}
      <StudentBottomToolbar
        raisedHand={classroom.raisedHand}
        onRaiseHand={classroom.raiseHand}
        notesOpen={activePanel === 'notes'}
        onToggleNotes={() => openPanel('notes')}
        chatOpen={activePanel === 'chat'}
        onToggleChat={() => openPanel('chat')}
        unreadChat={classroom.unreadChat}
        questionsOpen={activePanel === 'questions'}
        onToggleQuestions={() => openPanel('questions')}
        isCurrentSlideBookmarked={classroom.isCurrentSlideBookmarked}
        onToggleBookmark={() => classroom.toggleBookmark(classroom.currentSlide?.id || '')}
        isFullscreen={classroom.isFullscreen}
        onToggleFullscreen={classroom.toggleFullscreen}
        reactionsOpen={reactionsOpen}
        onToggleReactions={() => setReactionsOpen((v) => !v)}
        onReaction={handleReaction}
      />

      {/* Floating emoji reactions */}
      <AnimatePresence>
        {floatingReactions.map(({ id, emoji }) => (
          <FloatingReaction
            key={id}
            emoji={emoji}
            onDone={() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id))}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
