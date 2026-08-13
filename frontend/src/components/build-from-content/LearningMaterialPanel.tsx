/**
 * LearningMaterialPanel
 *
 * Full-panel experience for uploading learning material.
 * Supports drag-and-drop, multi-file queuing, and browsing.
 * Every file becomes an Assessment Document through the same pipeline.
 */

import { useState, useRef, useCallback } from 'react';
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  Presentation,
  X,
  Upload,
  ArrowRight,
  ArrowLeft,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface QueuedFile {
  id: string;
  file: File;
}

interface LearningMaterialPanelProps {
  onSubmit: (files: File[]) => void;
  onBack: () => void;
  processing?: boolean;
}

const ACCEPTED_EXTENSIONS =
  '.pdf,.docx,.doc,.txt';

const FORMAT_TAGS = [
  'PDF', 'DOCX', 'TXT',
];

function getFileIcon(file: File) {
  const name = file.name.toLowerCase();
  if (name.match(/\.(png|jpg|jpeg|gif|bmp|tiff)$/)) return FileImage;
  if (name.match(/\.(csv|xls|xlsx)$/)) return FileSpreadsheet;
  if (name.match(/\.(pptx|ppt)$/)) return Presentation;
  return FileText;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LearningMaterialPanel({
  onSubmit,
  onBack,
  processing,
}: LearningMaterialPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const newFiles: QueuedFile[] = Array.from(incoming).map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      file,
    }));
    setQueue((prev) => {
      const existingNames = new Set(prev.map((q) => q.file.name));
      return [...prev, ...newFiles.filter((f) => !existingNames.has(f.file.name))];
    });
  }, []);

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only trigger if leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleAnalyse = () => {
    console.log('[LearningMaterialPanel] handleAnalyse ENTRY', { queueLength: queue.length });
    if (queue.length === 0) {
      console.log('[LearningMaterialPanel] handleAnalyse EXIT - empty queue');
      return;
    }
    const files = queue.map((q) => q.file);
    console.log('[LearningMaterialPanel] handleAnalyse calling onSubmit', { 
      fileCount: files.length, 
      fileNames: files.map(f => f.name),
      fileSizes: files.map(f => f.size)
    });
    onSubmit(files);
    console.log('[LearningMaterialPanel] handleAnalyse EXIT');
  };

  const hasFiles = queue.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-white text-lg">Learning Material</h3>
          </div>
          <p className="text-xs text-white/40 mt-0.5">
            Drop your files — GateHub converts everything to an Assessment Document
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !hasFiles && fileInputRef.current?.click()}
        className={cn(
          'relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer',
          isDragging
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : hasFiles
            ? 'border-white/10 bg-white/[0.02] cursor-default'
            : 'border-white/15 bg-white/[0.02] hover:border-primary/50 hover:bg-primary/5'
        )}
      >
        {/* Animated glow when dragging */}
        {isDragging && (
          <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-pulse pointer-events-none" />
        )}

        {/* Empty drop zone content */}
        {!hasFiles && (
          <div className="flex flex-col items-center justify-center gap-4 py-14 px-6 text-center">
            <div
              className={cn(
                'flex h-16 w-16 items-center justify-center rounded-2xl transition-colors',
                isDragging ? 'bg-primary/30' : 'bg-primary/15'
              )}
            >
              <Upload
                className={cn(
                  'h-8 w-8 transition-colors',
                  isDragging ? 'text-primary' : 'text-primary/70'
                )}
              />
            </div>
            <div>
              <p className="text-base font-semibold text-white">
                {isDragging ? 'Drop files here' : 'Drag & drop your files'}
              </p>
              <p className="text-sm text-white/40 mt-1">
                or{' '}
                <span className="text-primary hover:underline cursor-pointer">
                  browse from your computer
                </span>
              </p>
            </div>
            {/* Format tags */}
            <div className="flex flex-wrap justify-center gap-1.5 max-w-xs">
              {FORMAT_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/8 px-2.5 py-0.5 text-[11px] font-medium text-white/50 border border-white/10"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* File queue */}
        {hasFiles && (
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-white/70">
                {queue.length} file{queue.length !== 1 ? 's' : ''} queued
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                + Add more
              </button>
            </div>
            {queue.map(({ id, file }) => {
              const FileIcon = getFileIcon(file);
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 group"
                >
                  <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-primary/15 shrink-0">
                    <FileIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{file.name}</p>
                    <p className="text-xs text-white/35">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(id); }}
                    className="h-6 w-6 flex items-center justify-center rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Drop more overlay when dragging over queue */}
            {isDragging && (
              <div className="absolute inset-0 rounded-2xl bg-primary/10 border-2 border-primary border-dashed flex items-center justify-center">
                <p className="text-primary font-semibold">Drop to add files</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={ACCEPTED_EXTENSIONS}
        onChange={(e) => addFiles(e.target.files)}
      />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-white/50 hover:text-white hover:bg-white/8"
        >
          Back
        </Button>
        <Button
          className={cn(
            'ml-auto gap-2 px-6 font-semibold',
            'bg-primary hover:bg-primary/90 text-primary-foreground',
            'shadow-lg shadow-primary/20 transition-all'
          )}
          disabled={!hasFiles || processing}
          onClick={handleAnalyse}
        >
          {processing ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Processing…
            </>
          ) : (
            <>
              Analyse {queue.length > 0 ? `${queue.length} file${queue.length !== 1 ? 's' : ''}` : 'Files'}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
