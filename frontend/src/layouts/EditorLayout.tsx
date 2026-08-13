import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

export function EditorLayout() {
  const location = useLocation();
  
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#1e1e1e] text-slate-200">
      <AnimatePresence mode="wait">
        <motion.div
           key={location.pathname}
           initial={{ opacity: 0, scale: 0.98 }}
           animate={{ opacity: 1, scale: 1 }}
           exit={{ opacity: 0, scale: 0.98 }}
           transition={{ duration: 0.3, ease: "easeInOut" }}
           className="w-full h-full"
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
