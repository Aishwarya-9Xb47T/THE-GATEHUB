/**
 * Student Interaction System
 * 
 * Handles all student-side interactions in live classroom sessions.
 * Supports multiple interaction types with extensible architecture.
 * Content is extracted from slides - interactions only define behavior.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Clock, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToastStore } from '@/store/toastStore';
import { parseSlide } from '@/lib/slideParser/index';

// ============================================================================
// INTERACTION TYPES
// ============================================================================

export type InteractionType = 
  | 'multiple_choice'
  | 'single_choice'
  | 'poll'
  | 'rating'
  | 'quiz'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'long_answer'
  | 'word_cloud'
  | 'matching'
  | 'ordering'
  | 'clickable_image'
  | 'drawing'
  | 'code_editor'
  | 'upload_file'
  | 'mcq'
  | 'multiple_select'
  | 'open_answer'
  | 'discussion'
  | 'reflection'
  | 'exit_ticket'
  | 'attendance_check'
  | 'emoji_voting'
  | 'reaction'
  | 'ai_question';

export type SubmissionState = 
  | 'not_started'
  | 'answering'
  | 'submitted'
  | 'locked'
  | 'timed_out'
  | 'reviewed';

export interface InteractionOption {
  id: string;
  text: string;
  isCorrect?: boolean;
  order?: number;
}

export interface Interaction {
  id: string;
  type: InteractionType;
  settings?: any;
  duration?: number; // in seconds
  points: number;
  timerEnabled?: boolean;
  timerEndsAt?: string;
  status: 'active' | 'closed' | 'results';
}

export interface StudentSubmission {
  interactionId: string;
  response: any;
  submittedAt: string;
  isCorrect?: boolean;
  score?: number;
  feedback?: string;
}

// ============================================================================
// INTERACTION COMPONENT PROPS
// ============================================================================

export interface InteractionComponentProps {
  interaction: Interaction;
  slide: any; // Slide data for content extraction
  value: any;
  onChange: (value: any) => void;
  disabled: boolean;
  submitted: boolean;
  timeRemaining?: number;
}

// ============================================================================
// MULTIPLE CHOICE COMPONENT
// ============================================================================

export function MultipleChoiceInteraction({ 
  interaction, 
  slide,
  value, 
  onChange, 
  disabled, 
  submitted 
}: InteractionComponentProps) {
  const selected = Array.isArray(value) ? value : (value ? [value] : []);
  const allowMultiple = interaction.type === 'multiple_select';
  
  // Extract content from slide
  const parsedSlide = parseSlide(slide);
  const options = parsedSlide.options || [];

  return (
    <div className="space-y-3">
      {options.map((option, index) => {
        const isSelected = selected.includes(option.text);
        const letter = String.fromCharCode(65 + index);
        
        return (
          <Button
            key={index}
            variant={isSelected ? 'default' : 'outline'}
            className={`w-full justify-start ${submitted && option.isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}`}
            onClick={() => {
              if (disabled || submitted) return;
              
              if (allowMultiple) {
                const newSelected = isSelected 
                  ? selected.filter((v: any) => v !== option.text)
                  : [...selected, option.text];
                onChange(newSelected);
              } else {
                onChange(option.text);
              }
            }}
            disabled={disabled || submitted}
          >
            <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mr-3 font-semibold">
              {letter}
            </span>
            {option.text}
            {submitted && option.isCorrect && (
              <CheckCircle className="ml-auto h-5 w-5 text-green-500" />
            )}
          </Button>
        );
      })}
    </div>
  );
}

// ============================================================================
// POLL COMPONENT
// ============================================================================

export function PollInteraction({ 
  interaction, 
  slide,
  value, 
  onChange, 
  disabled, 
  submitted,
  timeRemaining 
}: InteractionComponentProps) {
  // Extract content from slide
  const parsedSlide = parseSlide(slide);
  const options = parsedSlide.options || [];

  return (
    <div className="space-y-3">
      {options.map((option, index) => {
        const isSelected = value === option.text;
        const percentage = Math.random() * 100; // Would come from real-time poll results
        
        return (
          <div key={index} className="space-y-1">
            <Button
              variant={isSelected ? 'default' : 'outline'}
              className="w-full justify-start relative overflow-hidden"
              onClick={() => {
                if (disabled || submitted) return;
                onChange(option.text);
              }}
              disabled={disabled || submitted}
            >
              <span className="relative z-10">{option.text}</span>
              {submitted && (
                <div 
                  className="absolute inset-y-0 left-0 bg-primary/20 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              )}
            </Button>
            {submitted && (
              <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                <span>{percentage.toFixed(1)}%</span>
                <span>{Math.round(percentage * 10 / 100)} votes</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// RATING COMPONENT
// ============================================================================

export function RatingInteraction({ 
  interaction, 
  slide,
  value, 
  onChange, 
  disabled, 
  submitted 
}: InteractionComponentProps) {
  // Extract content from slide
  const parsedSlide = parseSlide(slide);
  const maxRating = interaction.settings?.maxRating || 5;
  const rating = value ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-2">
        {Array.from({ length: maxRating }).map((_, index) => {
          const starValue = index + 1;
          return (
            <button
              key={index}
              onClick={() => {
                if (disabled || submitted) return;
                onChange(starValue);
              }}
              disabled={disabled || submitted}
              className={`text-4xl transition-transform hover:scale-110 ${
                starValue <= rating ? 'text-yellow-400' : 'text-gray-300'
              }`}
            >
              ★
            </button>
          );
        })}
      </div>
      {rating > 0 && (
        <p className="text-center text-muted-foreground">
          {rating} out of {maxRating} stars
        </p>
      )}
    </div>
  );
}

// ============================================================================
// SHORT ANSWER COMPONENT
// ============================================================================

export function ShortAnswerInteraction({ 
  interaction, 
  slide,
  value, 
  onChange, 
  disabled, 
  submitted 
}: InteractionComponentProps) {
  // Extract content from slide
  const parsedSlide = parseSlide(slide);
  const question = parsedSlide.question || '';
  const maxLength = 500;
  const currentLength = value?.length ?? 0;

  return (
    <div className="space-y-4">
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || submitted}
        placeholder="Type your answer here..."
        className="w-full p-4 border rounded-lg min-h-[120px] resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
        maxLength={maxLength}
      />
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{currentLength} / {maxLength} characters</span>
        {submitted && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle className="h-4 w-4" />
            Submitted
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TRUE/FALSE COMPONENT
// ============================================================================

export function TrueFalseInteraction({ 
  interaction, 
  slide,
  value, 
  onChange, 
  disabled, 
  submitted 
}: InteractionComponentProps) {
  // Extract content from slide
  const parsedSlide = parseSlide(slide);
  const question = parsedSlide.question || '';

  return (
    <div className="grid grid-cols-2 gap-4">
      <Button
        variant={value === 'true' ? 'default' : 'outline'}
        size="lg"
        onClick={() => {
          if (disabled || submitted) return;
          onChange('true');
        }}
        disabled={disabled || submitted}
        className="h-24 text-xl"
      >
        True
      </Button>
      <Button
        variant={value === 'false' ? 'default' : 'outline'}
        size="lg"
        onClick={() => {
          if (disabled || submitted) return;
          onChange('false');
        }}
        disabled={disabled || submitted}
        className="h-24 text-xl"
      >
        False
      </Button>
    </div>
  );
}

// ============================================================================
// WORD CLOUD COMPONENT
// ============================================================================

export function WordCloudInteraction({ 
  interaction, 
  slide,
  value, 
  onChange, 
  disabled, 
  submitted 
}: InteractionComponentProps) {
  // Extract content from slide
  const parsedSlide = parseSlide(slide);
  const question = parsedSlide.question || '';

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || submitted}
        placeholder="Enter a word..."
        className="w-full p-4 border rounded-lg text-center text-2xl focus:ring-2 focus:ring-primary focus:border-transparent"
        maxLength={50}
      />
      {submitted && (
        <p className="text-center text-sm text-muted-foreground">
          Your word has been submitted
        </p>
      )}
    </div>
  );
}

// ============================================================================
// MAIN INTERACTION RENDERER
// ============================================================================

export function InteractionRenderer({ 
  interaction, 
  slide,
  value, 
  onChange, 
  disabled, 
  submitted,
  timeRemaining 
}: InteractionComponentProps) {
  switch (interaction.type) {
    case 'multiple_choice':
    case 'single_choice':
    case 'mcq':
    case 'multiple_select':
      return <MultipleChoiceInteraction {...{ interaction, slide, value, onChange, disabled, submitted }} />;
    case 'poll':
      return <PollInteraction {...{ interaction, slide, value, onChange, disabled, submitted, timeRemaining }} />;
    case 'rating':
      return <RatingInteraction {...{ interaction, slide, value, onChange, disabled, submitted }} />;
    case 'short_answer':
    case 'long_answer':
    case 'open_answer':
    case 'discussion':
    case 'reflection':
    case 'exit_ticket':
      return <ShortAnswerInteraction {...{ interaction, slide, value, onChange, disabled, submitted }} />;
    case 'true_false':
      return <TrueFalseInteraction {...{ interaction, slide, value, onChange, disabled, submitted }} />;
    case 'word_cloud':
      return <WordCloudInteraction {...{ interaction, slide, value, onChange, disabled, submitted }} />;
    default:
      return (
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-2" />
          <p>Interaction type not supported yet</p>
        </div>
      );
  }
}

// ============================================================================
// STUDENT INTERACTION PANEL
// ============================================================================

interface StudentInteractionPanelProps {
  interaction: Interaction | null;
  slide?: any;
  submission: StudentSubmission | null;
  onSubmit: (response: any) => Promise<void>;
  disabled?: boolean;
}

export function StudentInteractionPanel({ 
  interaction, 
  slide,
  submission, 
  onSubmit,
  disabled = false 
}: StudentInteractionPanelProps) {
  const [value, setValue] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | undefined>();
  const toast = useToastStore((s) => s.add);

  // Reset value when interaction changes
  useEffect(() => {
    if (interaction) {
      setValue(submission?.response ?? null);
    }
  }, [interaction, submission]);

  // Timer countdown
  useEffect(() => {
    if (!interaction?.timerEnabled || !interaction?.timerEndsAt) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const endTime = new Date(interaction.timerEndsAt!).getTime();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        // Auto-submit or lock
        if (value !== null && !submission) {
          handleSubmit();
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [interaction, value, submission]);

  const handleSubmit = async () => {
    if (!interaction || value === null || value === '') {
      toast({ 
        title: 'No Response', 
        description: 'Please provide an answer before submitting', 
        variant: 'destructive' 
      });
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(value);
      toast({ title: 'Submitted', description: 'Your response has been recorded' });
    } catch (error: any) {
      toast({ 
        title: 'Error', 
        description: 'Failed to submit response', 
        variant: 'destructive' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitted = !!submission;
  const isTimedOut = timeRemaining === 0;
  const canSubmit = !isSubmitted && !isTimedOut && !disabled && value !== null && value !== '';

  if (!interaction) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-6"
      >
        <Card className={`border-2 ${isSubmitted ? 'border-green-500/50' : 'border-primary/50'}`}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">{interaction.type.replace('_', ' ')}</Badge>
                  {interaction.points > 0 && (
                    <Badge variant="secondary">{interaction.points} pts</Badge>
                  )}
                </div>
                <CardTitle>{interaction.type.replace('_', ' ').toUpperCase()}</CardTitle>
              </div>
              {isSubmitted && (
                <Badge className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Submitted
                </Badge>
              )}
              {isTimedOut && !isSubmitted && (
                <Badge variant="destructive">
                  <Clock className="h-3 w-3 mr-1" />
                  Timed Out
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Timer */}
            {interaction.timerEnabled && timeRemaining !== undefined && !isSubmitted && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <Clock className={`h-5 w-5 ${timeRemaining <= 10 ? 'text-red-500 animate-pulse' : 'text-amber-600'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium">Time Remaining</p>
                  <Progress 
                    value={(timeRemaining / (interaction.duration || 60)) * 100} 
                    className="h-2 mt-1"
                  />
                </div>
                <span className={`text-lg font-bold ${timeRemaining <= 10 ? 'text-red-500' : 'text-amber-600'}`}>
                  {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}

            {/* Question - extracted from slide */}
            {(() => {
              const parsedSlide = slide ? parseSlide(slide) : null;
              return parsedSlide?.question ? (
                <p className="text-lg">{parsedSlide.question}</p>
              ) : null;
            })()}

            {/* Interaction Renderer */}
            <InteractionRenderer
              interaction={interaction}
              slide={slide}
              value={value}
              onChange={setValue}
              disabled={disabled || isTimedOut}
              submitted={isSubmitted}
              timeRemaining={timeRemaining}
            />

            {/* Submit Button */}
            {canSubmit && (
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting}
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Response
                  </>
                )}
              </Button>
            )}

            {/* Locked State */}
            {isTimedOut && !isSubmitted && (
              <div className="flex items-center justify-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
                <Lock className="h-5 w-5" />
                <span>Time expired. You can no longer submit.</span>
              </div>
            )}

            {/* Results Display */}
            {isSubmitted && submission?.feedback && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="font-medium mb-1">Feedback</p>
                <p className="text-sm text-muted-foreground">{submission.feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
