/**
 * ContentBuilderPage
 * 
 * Standalone page for building quizzes from content.
 * This page manages its own state and navigation, independent of QuizRoomWizard.
 * 
 * Flow: Source Selection → Upload/Analyze → Preview → Quiz Builder
 */

import { useNavigate } from 'react-router-dom';
import { BuildFromContentPage } from '@/components/build-from-content/BuildFromContentPage';

export function ContentBuilderPage() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/instructor/quiz-room');
  };

  const handleQuizCreated = (quizId: string, title: string, count: number) => {
    console.log('[ContentBuilderPage] Quiz created:', { quizId, title, count });
    // Navigate to Quiz Builder with the created quiz
    navigate(`/instructor/quiz-room/quizzes/${quizId}/edit`);
  };

  return (
    <div className="min-h-screen bg-background">
      <BuildFromContentPage
        onBack={handleBack}
        onQuizCreated={handleQuizCreated}
      />
    </div>
  );
}
