import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Clock, Send, Star, UserCheck, Eraser, RotateCcw, PenTool, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseSlide } from '@/lib/slideParser/index';

export interface Interaction {
  id: string;
  type: string;
  settings?: any;
  duration?: number;
  points?: number;
}

export interface InteractionOverlayProps {
  interaction: Interaction;
  slide: any; // The slide data containing the actual content
  submission: any;
  onSubmit: (response: any) => Promise<void>;
  revealed?: boolean;
  isCorrect?: boolean;
  canReopen?: boolean;
}

export function InteractionOverlay({
  interaction,
  slide,
  submission,
  onSubmit,
  revealed = false,
  isCorrect,
}: InteractionOverlayProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [textResponse, setTextResponse] = useState('');
  const [rating, setRating] = useState(5);
  const [drawingData, setDrawingData] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // SLIDE IS SOURCE OF TRUTH - Extract question and options from slide content
  const parsedSlide = parseSlide(slide);
  const settings = (interaction.settings ?? {}) as Record<string, unknown>;
  const settingsOptions = Array.isArray(settings.options)
    ? (settings.options as Array<{ text: string; isCorrect?: boolean }>)
    : [];
  const question =
    (typeof settings.question === 'string' && settings.question) ||
    parsedSlide.question ||
    slide.title ||
    'Interactive Question';
  const options = settingsOptions.length > 0 ? settingsOptions : parsedSlide.options;
  const hasSubmitted = !!submission;

  const handleSubmit = async () => {
    if (isSubmitting || hasSubmitted) return;

    let response: any;

    switch (interaction.type) {
      case 'poll':
      case 'mcq':
      case 'quiz':
      case 'true_false':
        response = selectedOption;
        break;
      case 'multiple_select':
        response = selectedOptions;
        break;
      case 'open_answer':
      case 'reflection':
      case 'discussion':
      case 'exit_ticket':
      case 'word_cloud':
        response = textResponse;
        break;
      case 'rating':
        response = rating;
        break;
      case 'emoji_voting':
        response = selectedOption;
        break;
      case 'drawing':
        response = drawingData || 'drawing_submitted';
        break;
      case 'attendance_check':
        response = 'present';
        break;
      default:
        response = selectedOption || textResponse || rating || 'submitted';
    }

    if (response === null || response === undefined || (typeof response === 'string' && !response.trim())) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(response);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInteractionContent = () => {
    switch (interaction.type) {
      case 'poll':
      case 'mcq':
      case 'quiz':
      case 'true_false':
        return (
          <PollInteraction
            options={options}
            selectedOption={selectedOption}
            setSelectedOption={setSelectedOption}
            hasSubmitted={hasSubmitted}
            revealed={revealed}
            isQuiz={interaction.type === 'quiz'}
          />
        );

      case 'multiple_select':
        return (
          <MultipleSelectInteraction
            options={options}
            selectedOptions={selectedOptions}
            setSelectedOptions={setSelectedOptions}
            hasSubmitted={hasSubmitted}
            revealed={revealed}
          />
        );

      case 'open_answer':
      case 'short_answer':
      case 'reflection':
      case 'discussion':
      case 'exit_ticket':
      case 'word_cloud':
      case 'numeric_answer':
        return (
          <TextInteraction
            textResponse={textResponse}
            setTextResponse={setTextResponse}
            hasSubmitted={hasSubmitted}
            placeholder={
              interaction.type === 'word_cloud'
                ? 'Enter a word or short phrase (max 30 chars)...'
                : interaction.type === 'numeric_answer'
                ? 'Enter a numerical answer...'
                : interaction.type === 'short_answer'
                ? 'Type your short answer...'
                : interaction.type === 'reflection'
                ? 'Share your thoughts and key insights...'
                : interaction.type === 'exit_ticket'
                ? 'What is your main takeaway from this topic?'
                : 'Type your response here...'
            }
            maxLength={interaction.type === 'word_cloud' ? 30 : interaction.type === 'numeric_answer' ? 20 : 500}
          />
        );

      case 'rating':
        return (
          <RatingInteraction
            rating={rating}
            setRating={setRating}
            hasSubmitted={hasSubmitted}
          />
        );

      case 'emoji_voting':
        return (
          <EmojiVotingInteraction
            selectedOption={selectedOption}
            setSelectedOption={setSelectedOption}
            hasSubmitted={hasSubmitted}
          />
        );

      case 'drawing':
        return (
          <DrawingInteraction
            hasSubmitted={hasSubmitted}
            setDrawingData={setDrawingData}
          />
        );

      case 'attendance_check':
        return (
          <AttendanceCheckInteraction
            checkedIn={checkedIn || hasSubmitted}
            onCheckIn={() => {
              setCheckedIn(true);
              void handleSubmit();
            }}
          />
        );

      default:
        return (
          <div className="text-center text-slate-500 py-8">
            <Sparkles className="w-8 h-8 text-violet-400 mx-auto mb-2" />
            <p className="font-medium text-slate-700">Interactive Activity</p>
            <p className="text-xs text-slate-500 mt-1">Select your response below</p>
          </div>
        );
    }
  };

  const isFormValid = (() => {
    if (hasSubmitted) return false;
    switch (interaction.type) {
      case 'poll':
      case 'mcq':
      case 'quiz':
      case 'true_false':
      case 'emoji_voting':
        return !!selectedOption;
      case 'multiple_select':
        return selectedOptions.length > 0;
      case 'open_answer':
      case 'reflection':
      case 'discussion':
      case 'exit_ticket':
      case 'word_cloud':
        return !!textResponse.trim();
      case 'rating':
        return rating >= 1;
      case 'drawing':
        return !!drawingData;
      case 'attendance_check':
        return true;
      default:
        return true;
    }
  })();

  return (
    <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <Card className="w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl">
        <CardHeader className="border-b bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md uppercase tracking-wider text-[11px] font-semibold px-2.5 py-1">
                {interaction.type.replace(/_/g, ' ')}
              </Badge>
              {interaction.points ? (
                <Badge className="bg-amber-400/30 text-amber-100 border-amber-300/40 text-xs px-2.5 py-0.5">
                  ⭐ {interaction.points} pts
                </Badge>
              ) : null}
            </div>
            {interaction.duration && (
              <div className="flex items-center gap-1.5 text-xs text-white/90 font-medium bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>{interaction.duration}s timer</span>
              </div>
            )}
          </div>
          <CardTitle className="text-xl font-bold text-white mt-3 leading-snug">
            {question}
          </CardTitle>
        </CardHeader>

        <ScrollArea className="flex-1 max-h-[62vh]">
          <CardContent className="p-6">
            {hasSubmitted && !revealed ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4 shadow-inner animate-pulse">
                  <Check className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Response Recorded!
                </h3>
                <p className="text-slate-600 max-w-md text-sm">
                  Your answer has been transmitted live to the instructor. Sit tight while responses are collected.
                </p>
              </div>
            ) : hasSubmitted && revealed ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-lg ${
                    isCorrect ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                  }`}
                >
                  {isCorrect ? (
                    <Check className="w-10 h-10" />
                  ) : (
                    <X className="w-10 h-10" />
                  )}
                </div>
                <h3
                  className={`text-2xl font-bold mb-2 ${
                    isCorrect ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {isCorrect ? 'Correct!' : 'Answer Revealed'}
                </h3>
                <p className="text-slate-600 text-sm max-w-md">
                  {isCorrect
                    ? 'Excellent job! You chose the correct response.'
                    : 'The correct answer is highlighted on screen.'}
                </p>
              </div>
            ) : (
              renderInteractionContent()
            )}
          </CardContent>
        </ScrollArea>

        {!hasSubmitted && !revealed && interaction.type !== 'attendance_check' && (
          <div className="border-t bg-slate-50/80 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !isFormValid}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold shadow-md px-6 py-2 rounded-xl transition-all"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting…
                  </span>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Answer
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Poll / MCQ / Quiz / True-False ──────────────────────────────────────────
function PollInteraction({
  options,
  selectedOption,
  setSelectedOption,
  hasSubmitted,
  revealed,
  isQuiz,
}: {
  options: Array<{ text: string; isCorrect?: boolean }>;
  selectedOption: string | null;
  setSelectedOption: (value: string) => void;
  hasSubmitted: boolean;
  revealed?: boolean;
  isQuiz?: boolean;
}) {
  // If options were not found in slide content, generate A, B, C, D fallbacks
  const displayOptions =
    options.length > 0
      ? options
      : [
          { text: 'Option A' },
          { text: 'Option B' },
          { text: 'Option C' },
          { text: 'Option D' },
        ];

  return (
    <div className="space-y-3">
      {displayOptions.map((option, index) => {
        const optionLabel = String.fromCharCode(65 + index);
        const isSelected = selectedOption === option.text || selectedOption === optionLabel;

        return (
          <div
            key={index}
            onClick={() => {
              if (!hasSubmitted) setSelectedOption(option.text);
            }}
            className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${
              isSelected
                ? 'border-violet-600 bg-violet-50/80 shadow-md ring-2 ring-violet-200'
                : 'border-slate-200 hover:border-violet-300 bg-white hover:bg-slate-50/80'
            } ${hasSubmitted ? 'pointer-events-none opacity-80' : ''}`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${
                  isSelected
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {optionLabel}
              </div>
              <span className="font-medium text-slate-800 text-base truncate">
                {option.text}
              </span>
            </div>

            {revealed && option.isCorrect && (
              <Badge className="bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1">
                ✔ Correct Answer
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Multiple Select ────────────────────────────────────────────────────────
function MultipleSelectInteraction({
  options,
  selectedOptions,
  setSelectedOptions,
  hasSubmitted,
  revealed,
}: {
  options: Array<{ text: string; isCorrect?: boolean }>;
  selectedOptions: string[];
  setSelectedOptions: (value: string[]) => void;
  hasSubmitted: boolean;
  revealed?: boolean;
}) {
  const displayOptions =
    options.length > 0
      ? options
      : [
          { text: 'Option A' },
          { text: 'Option B' },
          { text: 'Option C' },
          { text: 'Option D' },
        ];

  const toggleOption = (optionText: string) => {
    if (selectedOptions.includes(optionText)) {
      setSelectedOptions(selectedOptions.filter((o) => o !== optionText));
    } else {
      setSelectedOptions([...selectedOptions, optionText]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
        Select all options that apply:
      </p>
      {displayOptions.map((option, index) => {
        const optionLabel = String.fromCharCode(65 + index);
        const isSelected = selectedOptions.includes(option.text);

        return (
          <div
            key={index}
            onClick={() => !hasSubmitted && toggleOption(option.text)}
            className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${
              isSelected
                ? 'border-violet-600 bg-violet-50/80 shadow-md ring-2 ring-violet-200'
                : 'border-slate-200 hover:border-violet-300 bg-white hover:bg-slate-50/80'
            } ${hasSubmitted ? 'pointer-events-none opacity-80' : ''}`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                  isSelected
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
              </div>
              <span className="font-medium text-slate-800 text-base truncate">
                {optionLabel}. {option.text}
              </span>
            </div>

            {revealed && option.isCorrect && (
              <Badge className="bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1">
                ✔ Correct
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Text / Open Response / Reflection / Discussion / Word Cloud ─────────────
function TextInteraction({
  textResponse,
  setTextResponse,
  hasSubmitted,
  placeholder,
  maxLength = 500,
}: {
  textResponse: string;
  setTextResponse: (value: string) => void;
  hasSubmitted: boolean;
  placeholder: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Textarea
        value={textResponse}
        onChange={(e) => setTextResponse(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        disabled={hasSubmitted}
        className="min-h-[160px] p-4 text-base rounded-xl border-2 border-slate-200 focus:border-violet-600 focus:ring-violet-200 resize-none"
      />
      <div className="flex justify-end text-xs text-slate-400 font-mono">
        {textResponse.length} / {maxLength}
      </div>
    </div>
  );
}

// ── Rating Interaction ──────────────────────────────────────────────────────
function RatingInteraction({
  rating,
  setRating,
  hasSubmitted,
}: {
  rating: number;
  setRating: (value: number) => void;
  hasSubmitted: boolean;
}) {
  return (
    <div className="flex flex-col items-center py-6 space-y-6">
      <p className="text-sm font-medium text-slate-600">Rate from 1 (lowest) to 5 (highest):</p>
      <div className="flex items-center gap-3">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={hasSubmitted}
            onClick={() => setRating(star)}
            className={`p-3 rounded-2xl transition-all transform hover:scale-110 active:scale-95 ${
              rating >= star
                ? 'bg-amber-400 text-white shadow-lg shadow-amber-300/40'
                : 'bg-slate-100 text-slate-300 hover:text-slate-400'
            } ${hasSubmitted ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <Star className="w-8 h-8 fill-current" />
          </button>
        ))}
      </div>
      <div className="text-3xl font-extrabold text-violet-700 font-mono">
        {rating} / 5 Stars
      </div>
    </div>
  );
}

// ── Emoji Voting ────────────────────────────────────────────────────────────
function EmojiVotingInteraction({
  selectedOption,
  setSelectedOption,
  hasSubmitted,
}: {
  selectedOption: string | null;
  setSelectedOption: (value: string) => void;
  hasSubmitted: boolean;
}) {
  const emojis = [
    { emoji: '👍', label: 'Agree' },
    { emoji: '❤️', label: 'Love' },
    { emoji: '🔥', label: 'Great' },
    { emoji: '💡', label: 'Insight' },
    { emoji: '🎉', label: 'Celebrate' },
    { emoji: '🤔', label: 'Thinking' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      {emojis.map(({ emoji, label }) => {
        const isSelected = selectedOption === emoji;

        return (
          <button
            key={emoji}
            type="button"
            disabled={hasSubmitted}
            onClick={() => setSelectedOption(emoji)}
            className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all transform hover:scale-105 active:scale-95 ${
              isSelected
                ? 'border-violet-600 bg-violet-50/90 shadow-lg ring-2 ring-violet-300'
                : 'border-slate-200 hover:border-violet-300 bg-white'
            } ${hasSubmitted ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="text-4xl mb-2">{emoji}</span>
            <span className="text-xs font-semibold text-slate-700">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Drawing Interaction ─────────────────────────────────────────────────────
function DrawingInteraction({
  hasSubmitted,
  setDrawingData,
}: {
  hasSubmitted: boolean;
  setDrawingData: (data: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#7c3aed'); // Violet default
  const [lineWidth, setLineWidth] = useState(4);
  const [isEraser, setIsEraser] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (hasSubmitted) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || hasSubmitted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;

    ctx.strokeStyle = isEraser ? '#ffffff' : color;
    ctx.lineWidth = isEraser ? lineWidth * 3 : lineWidth;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();

    setDrawingData(canvas.toDataURL('image/png'));
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setDrawingData(canvas.toDataURL('image/png'));
  };

  const colors = ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#000000'];

  return (
    <div className="space-y-3">
      {/* Drawing Toolbar */}
      <div className="flex items-center justify-between p-2 bg-slate-100 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1.5">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              disabled={hasSubmitted}
              onClick={() => {
                setColor(c);
                setIsEraser(false);
              }}
              className={`w-7 h-7 rounded-full transition-transform ${
                !isEraser && color === c ? 'scale-125 ring-2 ring-violet-500 shadow-sm' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isEraser ? 'default' : 'outline'}
            onClick={() => setIsEraser(!isEraser)}
            disabled={hasSubmitted}
            className="h-8 text-xs"
          >
            <Eraser className="w-3.5 h-3.5 mr-1" />
            Eraser
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clearCanvas}
            disabled={hasSubmitted}
            className="h-8 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="border-2 border-slate-300 rounded-2xl overflow-hidden shadow-inner bg-white">
        <canvas
          ref={canvasRef}
          width={540}
          height={280}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`w-full h-[280px] touch-none ${
            hasSubmitted ? 'cursor-not-allowed opacity-80' : 'cursor-crosshair'
          }`}
        />
      </div>
    </div>
  );
}

// ── Attendance Check ────────────────────────────────────────────────────────
function AttendanceCheckInteraction({
  checkedIn,
  onCheckIn,
}: {
  checkedIn: boolean;
  onCheckIn: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center space-y-5">
      <div
        className={`w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-all ${
          checkedIn
            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
            : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white animate-bounce'
        }`}
      >
        <UserCheck className="w-12 h-12" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-slate-800">
          {checkedIn ? 'Attendance Confirmed!' : 'Attendance Verification'}
        </h3>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">
          {checkedIn
            ? 'Your presence has been recorded for this live classroom session.'
            : 'Tap the button below to confirm you are actively present in class.'}
        </p>
      </div>

      {!checkedIn && (
        <Button
          onClick={onCheckIn}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-base px-8 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
        >
          <Check className="w-5 h-5 mr-2 stroke-[3]" />
          Confirm Attendance
        </Button>
      )}
    </div>
  );
}
