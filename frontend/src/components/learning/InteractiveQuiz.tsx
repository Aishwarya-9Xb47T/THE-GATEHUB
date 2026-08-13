import React, { useState } from 'react';
import { Check, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface InteractiveQuizProps {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

export function InteractiveQuiz({ question, options, correct, explanation }: InteractiveQuizProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleOptionClick = (option: string) => {
    if (isSubmitted) return;
    setSelectedAnswer(option);
    setIsSubmitted(true);
  };

  const isCorrect = selectedAnswer === correct;

  return (
    <Card className="my-10 overflow-hidden border-2 border-[#E7E9EB] dark:border-slate-700 shadow-md rounded-xl bg-white dark:bg-[#1e1e1e]">
      {/* Header */}
      <div className="bg-[#f1f1f1] dark:bg-[#2d3748] px-6 py-4 border-b border-[#ddd] dark:border-slate-700">
        <h3 className="text-xl font-bold text-[#282a35] dark:text-white">Quiz</h3>
      </div>

      <div className="p-8">
        {/* Question */}
        <div className="text-[20px] font-medium mb-8 text-[#282a35] dark:text-slate-200">
          {question}
        </div>

        {/* Options */}
        <div className="space-y-4">
          {options.map((option, idx) => {
            const isSelected = selectedAnswer === option;
            const isOptionCorrect = option === correct;
            
            let stateClasses = "bg-white dark:bg-slate-800 border-[#ddd] dark:border-slate-700 hover:bg-[#f1f1f1] dark:hover:bg-slate-700";
            
            if (isSubmitted) {
              if (isOptionCorrect) {
                stateClasses = "bg-[#04AA6D] text-white border-[#04AA6D]";
              } else if (isSelected && !isCorrect) {
                stateClasses = "bg-[#ff5f56] text-white border-[#ff5f56]";
              } else {
                stateClasses = "bg-white dark:bg-slate-800 border-[#ddd] dark:border-slate-700 opacity-60";
              }
            }

            return (
              <button
                key={idx}
                disabled={isSubmitted}
                onClick={() => handleOptionClick(option)}
                className={cn(
                  "w-full text-left p-5 rounded-xl border-2 transition-all duration-300 flex items-center justify-between group",
                  stateClasses,
                  !isSubmitted && "cursor-pointer active:scale-[0.99]"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm",
                    isSubmitted && isOptionCorrect ? "bg-white text-[#04AA6D] border-white" : 
                    isSubmitted && isSelected && !isCorrect ? "bg-white text-[#ff5f56] border-white" :
                    "border-[#ddd] dark:border-slate-600 text-[#555] dark:text-slate-400 group-hover:border-[#04AA6D]"
                  )}>
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <span className="text-lg font-medium">{option}</span>
                </div>
                
                {isSubmitted && isOptionCorrect && <Check className="w-6 h-6" />}
                {isSubmitted && isSelected && !isCorrect && <X className="w-6 h-6" />}
              </button>
            );
          })}
        </div>

        {/* Result & Explanation */}
        {isSubmitted && (
          <div className={cn(
            "mt-10 p-6 rounded-xl animate-in slide-in-from-top-4 duration-500",
            isCorrect ? "bg-[#e7f3ef] dark:bg-emerald-950/30" : "bg-[#fff0f0] dark:bg-red-950/30"
          )}>
            <div className="flex items-center gap-3 mb-3">
              {isCorrect ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-[#04AA6D] flex items-center justify-center text-white">
                    <Check className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold text-[#04AA6D]">Correct!</span>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-[#ff5f56] flex items-center justify-center text-white">
                    <X className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold text-[#ff5f56]">Incorrect</span>
                </>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 mt-1 text-slate-500 shrink-0" />
                <div>
                  <div className="font-bold text-slate-700 dark:text-slate-300 mb-1">Explanation:</div>
                  <div className="text-slate-600 dark:text-slate-400 leading-relaxed text-[17px]">
                    {explanation}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
