import { useState, useEffect, useRef } from 'react';

interface AutoSaveOptions {
  onSave: (content: string) => Promise<void>;
  debounceMs?: number;
}

export function useAutoSave({ onSave, debounceMs = 2000 }: AutoSaveOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<string>('');

  const saveContent = async (content: string) => {
    if (content === contentRef.current) return; // No change needed

    contentRef.current = content;
    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave(content);
      setLastSaved(new Date());
    } catch (error: any) {
      setSaveError(error instanceof Error ? error.message : 'Save failed');
      console.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const debouncedSave = (content: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      saveContent(content);
    }, debounceMs);
  };

  // Save immediately on specific events
  const saveImmediately = (content: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    saveContent(content);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Handle page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (contentRef.current) {
        // Use navigator.sendBeacon for reliable last-chance saves
        const data = new Blob([JSON.stringify({ content: contentRef.current })], {
          type: 'application/json'
        });
        navigator.sendBeacon('/api/resources/content/save', data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return {
    isSaving,
    lastSaved,
    saveError,
    debouncedSave,
    saveImmediately,
  };
}
