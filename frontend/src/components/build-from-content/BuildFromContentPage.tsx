/**
 * BuildFromContentPage
 *
 * PRODUCT REDESIGN — Premium unified "Build from Content" workflow.
 *
 * Philosophy:
 *   Users are building quizzes from learning material — not importing files.
 *   Every source becomes ONE AssessmentDocument before entering Quiz Builder.
 *   Quiz Builder NEVER knows whether content came from PDF, DOCX, Google Docs, or anything else.
 *
 * Flow:
 *   pick
 *     → learning-material → processing → review → Quiz Builder
 *     → paste-input       → processing → review → Quiz Builder
 *     → google-input (Gate: checking / not-configured / needs-auth / authenticated)
 *         → google-preview (Document preview)
 *             → processing → review → Quiz Builder
 *
 * Error rules:
 *   - NEVER show "Authentication required", "401", or raw backend errors
 *   - Auth errors: "Your Google connection needs to be refreshed" + Reconnect
 *   - Processing errors: "We couldn't read this document" + Retry + collapsed diagnostic
 *   - Network errors: "GateHub couldn't reach the server" + Try again
 */

import { useState } from 'react';
import { AlertCircle, RefreshCw, WifiOff, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { SourcePickerGrid, type ContentSource } from './SourcePickerGrid';
import { LearningMaterialPanel } from './LearningMaterialPanel';
import { PasteTextInput } from './PasteTextInput';
import { ProcessingScreen } from './AnalyzingScreen';

// New provider system
import { GoogleWorkspaceFlow } from '@/components/google-workspace/GoogleWorkspaceFlow';
import { AssessmentReviewWorkspace } from '@/components/assessment-review/AssessmentReviewWorkspace';
import type { ProviderFile } from '@/lib/providers/types';
import type { AssessmentDocument } from '@/lib/assessment/types';

import { analyzeFile, analyzePaste } from '@/lib/contentBuilder/api';
import type { ContentBuilderReviewPayload, ReviewQuestion } from '@/lib/contentBuilder/types';

// Commit helper
import axios from 'axios';
import type { ContentBuilderCommitResult } from '@/lib/contentBuilder/types';
import { apiUrl } from "@/lib/api";

// Convert ContentBuilderReviewPayload to AssessmentDocument
function toAssessmentDocument(payload: ContentBuilderReviewPayload, sourceType: string): AssessmentDocument {
  const now = new Date();
  return {
    metadata: {
      provider: 'local',
      sourceType: sourceType as 'pdf' | 'docx' | 'txt',
      title: 'Extracted Questions',
      createdAt: now,
      processedAt: now,
    },
    sections: [
      {
        id: 'default-section',
        title: 'All Questions',
        questionIds: payload.questions.map(q => q.id),
        order: 0,
      },
    ],
    questions: payload.questions.map(q => ({
      id: q.id,
      type: q.type === 'multiple_select' ? 'multiple-select' : q.type as 'multiple-choice' | 'multiple-select' | 'true-false' | 'short-answer' | 'fill-blank' | 'matching' | 'essay',
      text: q.text,
      options: q.options.map(o => o.text),
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      sectionId: 'default-section',
      order: 0,
      confidence: q.confidence,
      metadata: {
        table: (q as any).table || (q as any).metadata?.table,
        tables: (q as any).tables || (q as any).metadata?.tables,
        code: (q as any).code || (q as any).metadata?.code,
        codeBlocks: (q as any).codeBlocks || (q as any).metadata?.codeBlocks,
        equations: (q as any).equations || (q as any).metadata?.equations,
        formulas: (q as any).formulas || (q as any).metadata?.formulas,
        mediaUrl: (q as any).mediaUrl || (q as any).metadata?.mediaUrl,
        diagram: (q as any).diagram || (q as any).metadata?.diagram,
        images: (q as any).images || (q as any).metadata?.images,
        hyperlinks: (q as any).hyperlinks || (q as any).metadata?.hyperlinks,
        lists: (q as any).lists || (q as any).metadata?.lists,
      },
    })),
    images: [],
    tables: [],
    confidence: {
      overall: payload.questions.length > 0
        ? Math.round(payload.questions.reduce((acc, q) => acc + (q.confidence <= 1 ? q.confidence * 100 : q.confidence), 0) / payload.questions.length)
        : 100,
      byQuestion: payload.questions.map(q => q.confidence),
    },
    validation: {
      valid: true,
      issues: [],
    },
  };
}

async function commitQuestions(
  jobId: string,
  title: string,
  questionIds?: string[]
): Promise<{ data?: { data: ContentBuilderCommitResult }; error?: string }> {
  try {
    const res = await axios.post<{ success: boolean; data: ContentBuilderCommitResult }>(
      apiUrl(`/api/content-builder/jobs/${jobId}/commit`),
      { title, questionIds }
    );
    return { data: res.data };
  } catch (err: any) {
    const msg = axios.isAxiosError(err) ? err.response?.data?.error : String(err);
    return { error: msg || 'Failed to create quiz' };
  }
}

// ── Error categorization ──────────────────────────────────────────────────────

type ErrorCategory = 'auth' | 'processing' | 'network' | 'generic';

function categorizeError(msg: string): ErrorCategory {
  const lower = msg.toLowerCase();
  if (
    lower.includes('auth') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('token') ||
    lower.includes('google not')
  ) return 'auth';

  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('unreachable')
  ) return 'network';

  if (
    lower.includes('parse') ||
    lower.includes('unsupported') ||
    lower.includes('read') ||
    lower.includes('extract')
  ) return 'processing';

  return 'generic';
}

const ERROR_UI: Record<ErrorCategory, {
  icon: typeof AlertCircle;
  headline: string;
  detail: string;
  primaryCta: string;
  secondaryCta?: string;
}> = {
  auth: {
    icon: Link,
    headline: 'Your Google connection needs to be refreshed',
    detail: 'Sign back in to reconnect your Google Workspace and try again.',
    primaryCta: 'Reconnect Google',
    secondaryCta: 'Use a different source',
  },
  processing: {
    icon: AlertCircle,
    headline: "We couldn't read this document",
    detail: 'GateHub was unable to extract content from this file. It may be empty, encrypted, or in an unsupported format.',
    primaryCta: 'Try a different file',
  },
  network: {
    icon: WifiOff,
    headline: "Couldn't reach the server",
    detail: 'There was a network problem. Check your connection and try again.',
    primaryCta: 'Try again',
  },
  generic: {
    icon: AlertCircle,
    headline: 'Something went wrong',
    detail: 'GateHub encountered an unexpected issue. Please try again.',
    primaryCta: 'Try again',
  },
};

// ── Phase ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'pick'              // Source selection
  | 'learning-material' // File upload panel
  | 'paste-input'       // Paste text entry
  | 'provider-input'    // Cloud Provider Workspace (replaces google-input)
  | 'processing'        // Universal pipeline running
  | 'review'            // Assessment Review Workspace
  | 'committing'        // Saving and opening Quiz Builder
  | 'error';

const PROCESSING_SOURCE_LABELS: Record<ContentSource, string> = {
  learning_material: 'Reading your learning material…',
  paste_text:        'Reading pasted content…',
  cloud_workspace:  'Reading from cloud provider…',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface BuildFromContentPageProps {
  targetQuizId?: string;
  quizTitle?: string;
  onBack: () => void;
  onQuizCreated: (quizId: string, title: string, count: number) => void;
}

export function BuildFromContentPage({
  quizTitle = 'My Quiz',
  onBack,
  onQuizCreated,
}: BuildFromContentPageProps) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [activeSource, setActiveSource] = useState<ContentSource | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const [review, setReview] = useState<ContentBuilderReviewPayload | null>(null);
  const [assessmentDocument, setAssessmentDocument] = useState<AssessmentDocument | null>(null);
  const [rawErrorMsg, setRawErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Provider file state
  const [selectedProviderFile, setSelectedProviderFile] = useState<ProviderFile | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleError = (msg: string) => {
    setRawErrorMsg(msg);
    setPhase('error');
  };

  const runPipeline = async (
    fn: (onProgress: (step: number) => void) => Promise<{
      data?: { data: ContentBuilderReviewPayload };
      error?: string;
    }>
  ) => {
    console.log('[BuildFromContentPage] runPipeline ENTRY');
    setPhase('processing');
    setProcessingStep(0);
    
    try {
      console.log('[BuildFromContentPage] runPipeline - calling function');
      const result = await fn((step) => {
        console.log('[BuildFromContentPage] runPipeline - progress step', step);
        setProcessingStep(step);
      });
      console.log('[BuildFromContentPage] runPipeline - function completed', { 
        hasError: !!result.error, 
        hasData: !!result.data?.data,
        questionCount: result.data?.data?.questions?.length || 0,
        jobId: result.data?.data?.jobId
      });
      if (result.error || !result.data?.data) {
        console.log('[BuildFromContentPage] runPipeline EXIT - error', { error: result.error });
        handleError(result.error || 'Something went wrong. Please try again.');
        return;
      }
      
      // Check if no questions were extracted
      if (!result.data.data.questions || result.data.data.questions.length === 0) {
        console.log('[BuildFromContentPage] runPipeline EXIT - no questions');
        handleError('No questions could be found in this content. Try a different file or add more content.');
        return;
      }
      
      console.log('[BuildFromContentPage] runPipeline - setting review state with', {
        questionCount: result.data.data.questions.length,
        jobId: result.data.data.jobId,
        statistics: result.data.data.statistics
      });
      setReview(result.data.data);
      console.log('[BuildFromContentPage] runPipeline - review state set');
      
      // Convert to AssessmentDocument for AssessmentReviewWorkspace
      const doc = toAssessmentDocument(result.data.data, result.data.data.statistics.sourceType);
      setAssessmentDocument(doc);
      console.log('[BuildFromContentPage] runPipeline - assessmentDocument state set');
      
      console.log('[BuildFromContentPage] runPipeline - setting phase to review');
      setPhase('review');
      console.log('[BuildFromContentPage] runPipeline - phase set to review');
      console.log('[BuildFromContentPage] runPipeline EXIT - success');
    } catch (error: any) {
      console.log('[BuildFromContentPage] runPipeline EXIT - exception', { error });
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        handleError('Could not reach the server. Please check your connection.');
      } else if (errorMsg.includes('parse') || errorMsg.includes('read')) {
        handleError('We could not read this document. It may be corrupted or in an unsupported format.');
      } else {
        handleError('Something went wrong. Please try again.');
      }
    }
  };

  // ── Source selection ──────────────────────────────────────────────────────

  const handleSourceSelect = (source: ContentSource) => {
    setActiveSource(source);
    switch (source) {
      case 'learning_material': setPhase('learning-material'); break;
      case 'paste_text':        setPhase('paste-input');        break;
      case 'cloud_workspace':  setPhase('provider-input');       break;
    }
  };

  // ── Learning Material — multi-file sequential processing ──────────────────

  const handleFilesSubmit = async (files: File[]) => {
    console.log('[BuildFromContentPage] handleFilesSubmit ENTRY', { 
      fileCount: files?.length,
      fileNames: files?.map(f => f.name)
    });
    
    if (!files || files.length === 0) {
      console.log('[BuildFromContentPage] handleFilesSubmit EXIT - no files');
      handleError('Please select a file to upload.');
      return;
    }
    
    const maxSize = 50 * 1024 * 1024; // 50MB
    for (const file of files) {
      if (file.size > maxSize) {
        console.log('[BuildFromContentPage] handleFilesSubmit EXIT - file too large', { fileName: file.name, size: file.size });
        handleError(`"${file.name}" is too large. Please upload files smaller than 50MB.`);
        return;
      }
    }
    
    console.log('[BuildFromContentPage] Setting phase to processing');
    setActiveSource('learning_material');
    setPhase('processing');
    setProcessingStep(0);

    if (files.length === 1) {
      console.log('[BuildFromContentPage] Single file - calling runPipeline with analyzeFile', { fileName: files[0].name });
      await runPipeline((onP) => analyzeFile(files[0], onP));
      console.log('[BuildFromContentPage] Single file - runPipeline completed', { currentPhase: phase });
      console.log('[BuildFromContentPage] Single file - current state', { 
        phase, 
        hasReview: !!review, 
        reviewQuestionCount: review?.questions?.length || 0 
      });
      return;
    }

    // Multiple files — process sequentially, merge questions
    console.log('[BuildFromContentPage] Multiple files - processing sequentially');
    const allQuestions: ReviewQuestion[] = [];
    let lastPayload: ContentBuilderReviewPayload | null = null;

    for (const file of files) {
      console.log('[BuildFromContentPage] Processing file', { fileName: file.name });
      setProcessingStep(0);
      const result = await analyzeFile(file, (step) => setProcessingStep(step));
      console.log('[BuildFromContentPage] analyzeFile result', { 
        hasError: !!result.error, 
        hasData: !!result.data?.data,
        error: result.error
      });
      if (result.error || !result.data?.data) {
        console.log('[BuildFromContentPage] EXIT - processing failed', { fileName: file.name });
        handleError(`Could not process "${file.name}": ${result.error ?? 'Unknown error'}`);
        return;
      }
      lastPayload = result.data.data;
      allQuestions.push(...lastPayload.questions);
    }

    if (!lastPayload) {
      console.log('[BuildFromContentPage] EXIT - no payload');
      return;
    }

    console.log('[BuildFromContentPage] Setting review and phase to review');
    const mergedPayload: ContentBuilderReviewPayload = {
      jobId: lastPayload.jobId,
      questions: allQuestions,
      statistics: {
        ...lastPayload.statistics,
        questionsFound: allQuestions.length,
        highConfidence:   allQuestions.filter((q) => q.confidence >= 85).length,
        mediumConfidence: allQuestions.filter((q) => q.confidence >= 60 && q.confidence < 85).length,
        lowConfidence:    allQuestions.filter((q) => q.confidence < 60).length,
      },
    };
    setReview(mergedPayload);
    
    // Convert to AssessmentDocument for AssessmentReviewWorkspace
    const doc = toAssessmentDocument(mergedPayload, mergedPayload.statistics.sourceType);
    setAssessmentDocument(doc);
    
    setPhase('review');
    console.log('[BuildFromContentPage] handleFilesSubmit EXIT');
  };

  // ── Cloud Provider: file selected → process directly (no preview step) ──────────

  const handleProviderFileSelect = async (file: ProviderFile, providerId: string) => {
    setSelectedProviderFile(file);
    setSelectedProviderId(providerId);
    setActiveSource('cloud_workspace');

    // Download file from provider and process through content-builder pipeline
    setPhase('processing');
    setProcessingStep(0);

    try {
      // Step 1: Download file from provider
      const downloadResponse = await fetch(apiUrl(`/api/providers/${providerId}/files/${file.id}`));
      
      if (!downloadResponse.ok) {
        if (downloadResponse.status === 401) {
          handleError('Your Google connection has expired. Please reconnect.');
          return;
        }
        if (downloadResponse.status === 404) {
          handleError('This file was not found or has been deleted.');
          return;
        }
        handleError('Could not reach the provider. Please check your connection.');
        return;
      }

      const downloadResult = await downloadResponse.json();

      if (!downloadResult.success || !downloadResult.data) {
        handleError(downloadResult.error || 'Failed to download file from provider');
        return;
      }

      // Step 2: Create a File object from the downloaded content
      const { content, fileType } = downloadResult.data;
      if (!content) {
        handleError('The file is empty or could not be read.');
        return;
      }
      
      const buffer = Buffer.from(content, 'base64');
      const blob = new Blob([buffer], { type: fileType || 'application/octet-stream' });
      const downloadedFile = new File([blob], file.name, { type: fileType || 'application/octet-stream' });

      // Step 3: Process through the standard content-builder pipeline
      await runPipeline((onP) => analyzeFile(downloadedFile, onP));
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        handleError('Could not reach the provider. Please check your connection.');
      } else {
        handleError('Failed to process content from provider');
      }
    }
  };

  // ── Review → Quiz Builder ─────────────────────────────────────────────────

  const handleContinue = async (approvedIds: string[]) => {
    console.log('[BuildFromContentPage] handleContinue ENTRY', { 
      approvedIdsCount: approvedIds.length,
      jobId: review?.jobId,
      quizTitle
    });
    if (!review) {
      console.log('[BuildFromContentPage] handleContinue EXIT - no review');
      return;
    }
    setSubmitting(true);
    console.log('[BuildFromContentPage] handleContinue - setting phase to committing');
    setPhase('committing');
    console.log('[BuildFromContentPage] handleContinue - calling commitQuestions');
    const result = await commitQuestions(review.jobId, quizTitle, approvedIds);
    console.log('[BuildFromContentPage] handleContinue - commitQuestions result', { 
      hasError: !!result.error,
      hasData: !!result.data?.data
    });
    setSubmitting(false);
    if (result.error || !result.data?.data) {
      console.log('[BuildFromContentPage] handleContinue EXIT - error', { error: result.error });
      setPhase('review');
      return;
    }
    const { quizId, title, questionCount } = result.data.data;
    console.log('[BuildFromContentPage] handleContinue - calling onQuizCreated', { quizId, title, questionCount });
    onQuizCreated(quizId, title, questionCount);
    console.log('[BuildFromContentPage] handleContinue EXIT - success');
  };

  // ── Error action handlers ─────────────────────────────────────────────────

  const errorCategory = categorizeError(rawErrorMsg);
  const errorUi = ERROR_UI[errorCategory];

  const handleErrorPrimary = () => {
    if (errorCategory === 'auth') {
      setPhase('provider-input');
    } else if (errorCategory === 'network') {
      setPhase('pick');
    } else {
      setPhase('pick');
    }
    setRawErrorMsg('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* 1. Source picker */}
      {phase === 'pick' && (
        <SourcePickerGrid onSelect={handleSourceSelect} />
      )}

      {/* 2a. Learning Material */}
      {phase === 'learning-material' && (
        <LearningMaterialPanel
          onSubmit={handleFilesSubmit}
          onBack={() => setPhase('pick')}
        />
      )}

      {/* 2b. Paste text */}
      {phase === 'paste-input' && (
        <PasteTextInput
          onSubmit={(text) => {
            if (!text || text.trim().length === 0) {
              handleError('Please enter some text to analyze.');
              return;
            }
            
            if (text.trim().length < 50) {
              handleError('Please enter more text. We need at least 50 characters to find questions.');
              return;
            }
            
            if (text.length > 100000) {
              handleError('This text is too long. Please use a shorter excerpt (max 100,000 characters).');
              return;
            }
            
            setActiveSource('paste_text');
            runPipeline((onP) => analyzePaste(text, onP));
          }}
          onBack={() => setPhase('pick')}
        />
      )}

      {/* 2c. Google Workspace Flow */}
      {phase === 'provider-input' && (
        <GoogleWorkspaceFlow
          onImportComplete={(jobId, questions, statistics) => {
            const payload: ContentBuilderReviewPayload = {
              jobId,
              questions,
              statistics,
            };
            setReview(payload);
            const doc = toAssessmentDocument(payload, statistics?.sourceType || 'docs');
            setAssessmentDocument(doc);
            setPhase('review');
          }}
          onCancel={() => setPhase('pick')}
        />
      )}
      {/* 3. Processing (universal — source agnostic) */}
      {phase === 'processing' && (
        <ProcessingScreen
          currentStep={processingStep}
          sourceLabel={activeSource ? PROCESSING_SOURCE_LABELS[activeSource] : undefined}
        />
      )}

      {/* 4. Assessment Review Workspace */}
      {phase === 'review' && (review || assessmentDocument) && (
        <AssessmentReviewWorkspace
          assessmentDocument={assessmentDocument || undefined}
          quizTitle={quizTitle}
          onBack={() => { setAssessmentDocument(null); setReview(null); setPhase('pick'); }}
          onContinue={handleContinue}
          submitting={submitting}
        />
      )}

      {/* 5. Committing */}
      {phase === 'committing' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping" />
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          </div>
          <p className="text-white font-semibold">Opening Quiz Builder…</p>
          <p className="text-sm text-white/40">Your assessment is being prepared.</p>
        </div>
      )}

      {/* Error state — categorized, educator-safe */}
      {phase === 'error' && (
        <div className="space-y-5">
          <div className={cn(
            'rounded-2xl border p-5 space-y-3',
            errorCategory === 'auth'
              ? 'bg-sky-500/8 border-sky-500/20'
              : errorCategory === 'network'
              ? 'bg-amber-500/8 border-amber-500/20'
              : 'bg-red-500/8 border-red-500/20'
          )}>
            <div className="flex items-start gap-3">
              <errorUi.icon className={cn(
                'h-5 w-5 mt-0.5 shrink-0',
                errorCategory === 'auth'    ? 'text-sky-400'   :
                errorCategory === 'network' ? 'text-amber-400' : 'text-red-400'
              )} />
              <div>
                <p className="font-semibold text-white text-sm">{errorUi.headline}</p>
                <p className="text-sm text-white/50 mt-1 leading-relaxed">{errorUi.detail}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={onBack}
              className="text-white/40 hover:text-white hover:bg-white/8"
            >
              Go back
            </Button>

            {errorUi.secondaryCta && (
              <Button
                variant="outline"
                onClick={() => { setPhase('pick'); setRawErrorMsg(''); }}
                className="border-white/15 text-white/70 hover:bg-white/8"
              >
                {errorUi.secondaryCta}
              </Button>
            )}

            <Button
              className={cn(
                'ml-auto gap-2',
                errorCategory === 'auth'
                  ? 'bg-sky-600 hover:bg-sky-500 text-white'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground'
              )}
              onClick={handleErrorPrimary}
            >
              <RefreshCw className="h-4 w-4" />
              {errorUi.primaryCta}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}











