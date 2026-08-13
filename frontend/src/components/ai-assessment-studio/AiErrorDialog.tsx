import { motion } from "framer-motion";
import { AlertTriangle, Sparkles, ExternalLink, RefreshCw, WifiOff } from "lucide-react";
import type { AiErrorPayload } from "@/lib/aiAssessmentStudio/ApiError";
import { getDocumentationUrl } from "@/lib/aiAssessmentStudio/ErrorMapper";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AiErrorDialogProps {
  open: boolean;
  error: AiErrorPayload | null;
  demoMode?: boolean;
  onRetry?: () => void;
  onDismiss: () => void;
  onContinueOffline?: () => void;
}

export function AiErrorDialog({
  open,
  error,
  demoMode,
  onRetry,
  onDismiss,
  onContinueOffline,
}: AiErrorDialogProps) {
  if (!error) return null;

  const docsUrl = getDocumentationUrl(error.type);
  const showOffline = error.offlineFallback || demoMode;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent className="max-w-md border-white/10 bg-slate-950/95 text-white backdrop-blur-xl sm:rounded-2xl">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-amber-500/5" />
        <DialogHeader className="relative">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 shadow-lg shadow-primary/10"
          >
            {showOffline ? (
              <WifiOff className="h-7 w-7 text-primary" />
            ) : error.retryable ? (
              <RefreshCw className="h-7 w-7 text-primary" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-amber-400" />
            )}
          </motion.div>
          <DialogTitle className="text-center text-xl text-white">{error.title}</DialogTitle>
          <DialogDescription className="text-center text-sm leading-relaxed text-white/65">
            {error.message}
          </DialogDescription>
          {error.solution && (
            <p className="relative mt-2 text-center text-xs text-primary/90">{error.solution}</p>
          )}
          {error.requestedModel && error.activeModel && (
            <div className="relative mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-white/70">
              <p>Requested: <span className="text-white/90">{error.requestedModel}</span></p>
              <p>Available: <span className="text-primary">{error.activeModel}</span></p>
            </div>
          )}
          {demoMode && (
            <div className="relative mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span className="text-xs font-medium text-amber-300">Demo Mode — sample questions generated locally</span>
            </div>
          )}
        </DialogHeader>

        <DialogFooter className="relative flex-col gap-2 sm:flex-col">
          {error.retryable && onRetry && (
            <Button className="w-full" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
          {showOffline && onContinueOffline && (
            <Button variant="outline" className="w-full border-primary/30 text-white hover:bg-primary/10" onClick={onContinueOffline}>
              <WifiOff className="mr-2 h-4 w-4" />
              Continue Offline
            </Button>
          )}
          {docsUrl && (
            <Button
              variant="ghost"
              className="w-full text-white/70 hover:text-white"
              onClick={() => window.open(docsUrl, "_blank", "noopener")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Documentation
            </Button>
          )}
          <Button variant="ghost" className="w-full text-white/50" onClick={onDismiss}>
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
