import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToastStore } from '@/store/toastStore';
import { useUserStore } from '@/store/userStore';
import { getToken } from '@/lib/api';

export function ClassroomTokenJoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToastStore((s) => s.add);
  const { user, isLoading: userLoading } = useUserStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);

  useEffect(() => {
    // If user is not authenticated, redirect to login with return URL
    if (!userLoading && !user) {
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?redirect=${returnUrl}`, { state: { from: location.pathname + location.search } });
      return;
    }

    // If user is authenticated, proceed with token join
    if (user && token) {
      joinByToken();
    }
  }, [user, userLoading, token, navigate, location]);

  const joinByToken = async () => {
    if (!token) {
      setStatus('error');
      setError('No token provided');
      return;
    }

    try {
      const response = await fetch(`/api/classroom-studio/sessions/join-token/${token}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to join session');
      }

      const data = await response.json();
      setSessionInfo(data);
      setStatus('success');

      // Redirect based on session status
      setTimeout(() => {
        if (data.session.instructorStarted || data.session.status === 'active') {
          // Session is already active, go to live classroom
          navigate(`/student/classroom/session/${data.session.id}`);
        } else {
          // Session is waiting, go to waiting room
          navigate(`/student/classroom/waiting/${data.session.id}`);
        }
      }, 1500);
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to join session');
      toast({ title: 'Error', description: err.message || 'Failed to join session', variant: 'destructive' });
    }
  };

  const handleReturnToDashboard = () => {
    navigate('/student/classroom');
  };

  // Show loading while checking auth
  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="border-2">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <div className="mt-4">
                <h2 className="text-xl font-semibold mb-2">Loading...</h2>
                <p className="text-muted-foreground">Please wait</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="border-2">
          <CardContent className="p-8 text-center">
            {status === 'loading' && (
              <div className="space-y-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
                <div>
                  <h2 className="text-xl font-semibold mb-2">Joining Session...</h2>
                  <p className="text-muted-foreground">Please wait while we connect you to the classroom</p>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <div>
                  <h2 className="text-xl font-semibold mb-2">Successfully Joined!</h2>
                  <p className="text-muted-foreground">
                    {sessionInfo?.session?.title && `Connecting to "${sessionInfo.session.title}"...`}
                  </p>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <X className="h-16 w-16 text-destructive mx-auto" />
                <div>
                  <h2 className="text-xl font-semibold mb-2">Failed to Join</h2>
                  <p className="text-muted-foreground mb-4">{error || 'Unable to join the session'}</p>
                </div>
                <Button onClick={handleReturnToDashboard} className="w-full">
                  Return to Classroom
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
