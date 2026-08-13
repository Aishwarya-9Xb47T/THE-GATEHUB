import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export function LiveReadyStatusBar() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-muted-foreground shadow-sm backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <span>Waiting for next question…</span>
    </motion.div>
  );
}
