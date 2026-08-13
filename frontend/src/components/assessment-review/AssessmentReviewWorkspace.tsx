/**
 * AssessmentReviewWorkspace
 * 
 * Unified review interface for all content sources.
 * This component is completely source-agnostic - it doesn't care if content came from
 * PDF, DOCX, Google Docs, Google Forms, or any other source.
 */

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Check, X, Edit2, Trash2, GripVertical, Plus, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AssessmentDocument, Question } from '@/lib/assessment/types';

interface AssessmentReviewWorkspaceProps {
  assessmentDocument?: AssessmentDocument;
  quizTitle: string;
  onBack: () => void;
  onContinue: (approvedIds: string[]) => void;
  onQuestionsChange?: (questions: Question[]) => void;
  submitting?: boolean;
  summarySlot?: React.ReactNode;
}

type QuestionStatus = 'pending' | 'approved' | 'rejected';

export function AssessmentReviewWorkspace({
  assessmentDocument,
  quizTitle,
  onBack,
  onContinue,
  onQuestionsChange,
  submitting = false,
  summarySlot,
}: AssessmentReviewWorkspaceProps) {
  if (!assessmentDocument) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-white/60">No assessment document available</p>
        <Button onClick={onBack} variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  const [questions, setQuestions] = useState<Question[]>(() => assessmentDocument?.questions ?? []);

  useEffect(() => {
    if (assessmentDocument?.questions) {
      setQuestions(assessmentDocument.questions);
    }
  }, [assessmentDocument]);

  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatus>>(() => {
    const initial: Record<string, QuestionStatus> = {};
    (assessmentDocument?.questions ?? []).forEach(q => {
      const confVal = (q.confidence !== undefined && q.confidence <= 1) ? q.confidence * 100 : (q.confidence ?? 90);
      initial[q.id] = confVal >= 60 ? 'approved' : 'pending';
    });
    return initial;
  });

  const confidenceStats = useMemo(() => ({
    overall: questions.length
      ? Math.round(questions.reduce((acc, q) => {
        const c = (q.confidence !== undefined && q.confidence <= 1) ? q.confidence * 100 : (q.confidence ?? 90);
        return acc + c;
      }, 0) / questions.length)
      : 100,
    byQuestion: questions.map(q =>
      (q.confidence !== undefined && q.confidence <= 1) ? q.confidence * 100 : (q.confidence ?? 90)
    ),
  }), [questions]);

  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editedText, setEditedText] = useState('');

  const approvedCount = Object.values(questionStatuses).filter(s => s === 'approved').length;
  const pendingCount = Object.values(questionStatuses).filter(s => s === 'pending').length;
  const rejectedCount = Object.values(questionStatuses).filter(s => s === 'rejected').length;

  const handleStatusChange = (questionId: string, status: QuestionStatus) => {
    setQuestionStatuses(prev => ({ ...prev, [questionId]: status }));
  };

  const handleEditStart = (question: Question) => {
    setEditingQuestion(question.id);
    setEditedText(question.text);
  };

  const handleEditSave = (questionId: string) => {
    setQuestions((prev) => {
      const next = prev.map((q) => (q.id === questionId ? { ...q, text: editedText.trim() || q.text } : q));
      onQuestionsChange?.(next);
      return next;
    });
    setEditingQuestion(null);
    setEditedText('');
  };

  const handleEditCancel = () => {
    setEditingQuestion(null);
    setEditedText('');
  };

  const handleDelete = (questionId: string) => {
    setQuestionStatuses(prev => ({ ...prev, [questionId]: 'rejected' }));
  };

  const handleContinue = () => {
    const approvedIds = Object.entries(questionStatuses)
      .filter(([_, status]) => status === 'approved')
      .map(([id]) => id);
    onContinue(approvedIds);
  };

  const getQuestionTypeLabel = (type: Question['type']) => {
    const labels: Record<Question['type'], string> = {
      'multiple-choice': 'Multiple Choice',
      'multiple-select': 'Multiple Select',
      'true-false': 'True/False',
      'short-answer': 'Short Answer',
      'fill-blank': 'Fill in the Blank',
      'matching': 'Matching',
      'essay': 'Essay',
    };
    return labels[type] || type;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-emerald-400';
    if (confidence >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white/40 hover:text-white hover:bg-white/8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-bold text-white text-lg">Review Questions</h2>
            <p className="text-xs text-white/40">
              {assessmentDocument.metadata.title} • {questions.length} questions extracted
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-white/60">Approved: {approvedCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-white/60">Pending: {pendingCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-white/60">Rejected: {rejectedCount}</span>
            </div>
          </div>

          <Button
            onClick={handleContinue}
            disabled={approvedCount === 0 || submitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {submitting ? 'Opening Quiz Builder…' : `Open in Quiz Builder (${approvedCount})`}
          </Button>
        </div>
      </div>

      {summarySlot}

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Overall Confidence</p>
          <p className={cn('text-2xl font-bold text-white mt-1', getConfidenceColor(confidenceStats.overall))}>
            {Math.round(confidenceStats.overall)}%
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">High Confidence</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {confidenceStats.byQuestion.filter(c => c >= 80).length}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Medium Confidence</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            {confidenceStats.byQuestion.filter(c => c >= 60 && c < 80).length}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Low Confidence</p>
          <p className="text-2xl font-bold text-red-400 mt-1">
            {confidenceStats.byQuestion.filter(c => c < 60).length}
          </p>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-3">
        {questions.map((question, index) => {
          const status = questionStatuses[question.id];
          const isEditing = editingQuestion === question.id;

          return (
            <div
              key={question.id}
              className={cn(
                'rounded-xl border p-4 transition-all duration-200',
                status === 'approved'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : status === 'rejected'
                  ? 'border-red-500/30 bg-red-500/5 opacity-50'
                  : 'border-white/10 bg-white/[0.02]'
              )}
            >
              <div className="flex items-start gap-4">
                {/* Drag handle */}
                <div className="flex flex-col items-center gap-1 pt-1">
                  <GripVertical className="h-4 w-4 text-white/20 cursor-grab" />
                  <span className="text-[10px] text-white/30">{index + 1}</span>
                </div>

                {/* Question content */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-primary/50"
                        rows={3}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleEditSave(question.id)}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleEditCancel}
                          className="text-white/40 hover:text-white hover:bg-white/8"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full font-medium',
                          'bg-white/10 text-white/60'
                        )}>
                          {getQuestionTypeLabel(question.type)}
                        </span>
                        <span className={cn(
                          'text-[10px] font-medium',
                          getConfidenceColor(question.confidence)
                        )}>
                          {question.confidence}% confidence
                        </span>
                        {(question.metadata?.sourcePage || (question as any).sourcePage) && (
                          <span className="text-[10px] text-white/40">
                            Source: Page {(question.metadata?.sourcePage || (question as any).sourcePage)}
                            {question.metadata?.sourceSlide ? ` · Slide ${question.metadata.sourceSlide}` : ''}
                          </span>
                        )}
                      </div>
                      {/* Sequential Document Block Tree Renderer */}
                      {((question as any).children || question.metadata?.children || []).length > 0 ? (
                        <div className="space-y-2 my-2">
                          {((question as any).children || question.metadata?.children || []).map((block: any, bIdx: number) => {
                            switch (block.type) {
                              case 'text':
                                return (
                                  <p key={bIdx} className="text-sm text-white/90 leading-relaxed font-medium">
                                    {block.content}
                                  </p>
                                );
                              case 'table':
                                return (
                                  <div key={bIdx} className="my-2 p-2 rounded-lg bg-blue-950/40 border border-blue-500/30 overflow-x-auto">
                                    <table className="w-full text-xs font-mono border-collapse">
                                      {block.headers && block.headers.length > 0 && (
                                        <thead>
                                          <tr className="border-b border-blue-500/30 bg-blue-900/40 text-blue-200">
                                            {block.headers.map((h: string, hIdx: number) => (
                                              <th key={hIdx} className="px-2 py-1 text-left">{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                      )}
                                      <tbody>
                                        {(block.rows || []).map((row: string[], rIdx: number) => (
                                          <tr key={rIdx} className="border-b border-blue-500/10 hover:bg-blue-900/20 text-blue-100">
                                            {row.map((cell: string, cIdx: number) => (
                                              <td key={cIdx} className="px-2 py-1">{cell}</td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              case 'code':
                                return (
                                  <div key={bIdx} className="my-2 rounded-lg bg-slate-950 border border-purple-500/30 overflow-hidden">
                                    <div className="px-3 py-1 bg-purple-950/50 text-[10px] font-mono text-purple-300 border-b border-purple-500/20 flex justify-between">
                                      <span>💻 {block.language || 'code'}</span>
                                      <span>Syntax Preserved</span>
                                    </div>
                                    <pre className="p-3 font-mono text-xs text-purple-200 overflow-x-auto whitespace-pre-wrap">
                                      <code>{block.code}</code>
                                    </pre>
                                  </div>
                                );
                              case 'formula':
                                return (
                                  <div key={bIdx} className="my-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 font-mono text-xs flex items-center gap-2">
                                    <span className="text-amber-400 font-bold">∑</span>
                                    <code>{block.latex}</code>
                                  </div>
                                );
                              case 'image':
                                return (
                                  <div key={bIdx} className="my-2">
                                    <img src={block.imageUrl} alt={block.alt || 'Document Image'} className="max-h-48 rounded border border-emerald-500/30" />
                                    {block.caption && <p className="text-[11px] text-white/50 italic mt-1">{block.caption}</p>}
                                  </div>
                                );
                              case 'options':
                                return (
                                  <div key={bIdx} className="flex flex-wrap gap-2 my-2">
                                    {(block.options || []).map((option: any, optIdx: number) => {
                                      const labelText = typeof option === 'string' ? option : `${option.label ? option.label + ') ' : ''}${option.text}`;
                                      const isCorrect = typeof option === 'object' && Boolean(option.isCorrect);
                                      return (
                                        <span
                                          key={optIdx}
                                          className={cn(
                                            'text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors',
                                            isCorrect
                                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                                              : 'bg-white/5 text-white/70 border-white/10'
                                          )}
                                        >
                                          {labelText} {isCorrect ? '✅' : ''}
                                        </span>
                                      );
                                    })}
                                  </div>
                                );
                              case 'explanation':
                                return (
                                  <div key={bIdx} className="my-2 p-2 rounded-lg bg-white/5 border-l-2 border-amber-400 text-xs text-white/70 italic">
                                    💡 {block.content}
                                  </div>
                                );
                              default:
                                return null;
                            }
                          })}
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-white/90 leading-relaxed">{question.text}</p>
                          
                          {/* Rich Component Previews */}
                          {question.metadata && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {(question.metadata.table || question.metadata.tables) && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                                  📊 Editable Table
                                </span>
                              )}
                              {(question.metadata.code || question.metadata.codeBlocks) && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                                  💻 Code Block
                                </span>
                              )}
                              {(question.metadata.equations || question.metadata.formulas) && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                                  ∑ Formula
                                </span>
                              )}
                            </div>
                          )}

                          {question.options && question.options.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {question.options.map((option, i) => (
                                <span
                                  key={i}
                                  className="text-xs px-2 py-1 rounded-lg bg-white/5 text-white/60 border border-white/10"
                                >
                                  {typeof option === 'string' ? option : (option as any).text}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleEditStart(question)}
                    disabled={isEditing}
                    className="text-white/40 hover:text-white hover:bg-white/8"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleStatusChange(question.id, 'approved')}
                    className={cn(
                      'hover:bg-emerald-500/10',
                      status === 'approved' ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/40 hover:text-emerald-400'
                    )}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleStatusChange(question.id, 'rejected')}
                    className={cn(
                      'hover:bg-red-500/10',
                      status === 'rejected' ? 'text-red-400 bg-red-500/10' : 'text-white/40 hover:text-red-400'
                    )}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(question.id)}
                    className="text-white/40 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Validation Issues */}
      {assessmentDocument.validation.issues.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="font-semibold text-amber-400 text-sm mb-3">Validation Issues</h3>
          <div className="space-y-2">
            {assessmentDocument.validation.issues.map((issue, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded font-medium uppercase',
                  issue.severity === 'error' ? 'bg-red-500/20 text-red-400' :
                  issue.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-blue-500/20 text-blue-400'
                )}>
                  {issue.severity}
                </span>
                <span className="text-white/70">{issue.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
