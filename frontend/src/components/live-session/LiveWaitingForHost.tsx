import { motion } from "framer-motion";
import { Loader2, Hourglass } from "lucide-react";

interface LiveWaitingForHostProps {
  title?: string;
  subtitle?: string;
}

export function LiveWaitingForHost({
  title = "Answer submitted",
  subtitle = "Waiting for instructor…",
}: LiveWaitingForHostProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 rounded-2xl border bg-card p-12 text-center shadow-sm"
    >
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
          className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
        />
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Hourglass className="h-10 w-10 text-primary" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Stay on this screen — the next question will appear automatically</span>
      </div>

      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}
