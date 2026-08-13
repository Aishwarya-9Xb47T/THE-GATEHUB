import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ClassroomSessionEnd } from './ClassroomSessionEnd';
import { api } from '@/lib/api';

interface SessionResult {
  sessionId: string;
  sessionTitle: string;
  presentationTitle: string;
  instructor: string;
  duration: number;
  completedAt: string;
  totalInteractions: number;
  attemptedInteractions: number;
  participationRate: number;
  totalPoints: number;
  earnedPoints: number;
  scorePercentage: number;
  correctAnswers: number;
  totalQuestions: number;
  joinedAt: string;
  leftAt: string;
  attendanceDuration: number;
  overallFeedback?: string;
}

export function ClassroomSessionEndWrapper() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      if (!sessionId) return;

      try {
        const response = await api<SessionResult>(`/classroom-studio/sessions/${sessionId}/results`);
        if (response.error) throw new Error(response.error);
        setResults(response.data ?? null);
      } catch (err: any) {
        setError(err.message || 'Failed to load session results');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || 'Unable to load results'}</p>
          <button
            onClick={() => navigate('/student/classroom')}
            className="text-primary hover:underline"
          >
            Return to Classroom
          </button>
        </div>
      </div>
    );
  }

  return <ClassroomSessionEnd results={results} />;
}
