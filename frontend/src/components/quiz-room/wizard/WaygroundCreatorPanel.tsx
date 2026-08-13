import { motion } from "framer-motion";
import { WaygroundWorkspace } from "@/components/wayground/WaygroundWorkspace";

interface WaygroundCreatorPanelProps {
  onBack: () => void;
}

export function WaygroundCreatorPanel({ onBack }: WaygroundCreatorPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
    >
      <WaygroundWorkspace
        initialTab="quizzes"
        onBack={onBack}
        backLabel="Back to Methods"
        isInWizard={true}
        showFullscreen={false}
        showCopyLink={false}
        showJoinCode={false}
        showSettings={false}
      />
    </motion.div>
  );
}
