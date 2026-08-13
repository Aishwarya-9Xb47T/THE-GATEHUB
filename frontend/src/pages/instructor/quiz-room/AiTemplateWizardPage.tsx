import { Navigate } from "react-router-dom";

/** Legacy route — redirects to unified AI Quiz Designer in create wizard */
export function AiTemplateWizardPage() {
  return <Navigate to="/instructor/quiz-room/create?method=ai" replace />;
}
