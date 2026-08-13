import { motion } from 'framer-motion';
import { 
  Trophy, 
  CheckCircle, 
  Clock, 
  Users, 
  TrendingUp,
  Award,
  Download,
  Home,
  Calendar,
  Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';

interface SessionResult {
  sessionId: string;
  sessionTitle: string;
  presentationTitle: string;
  instructor: string;
  duration: number; // in minutes
  completedAt: string;
  
  // Participation metrics
  totalInteractions: number;
  attemptedInteractions: number;
  participationRate: number;
  
  // Performance metrics
  totalPoints: number;
  earnedPoints: number;
  scorePercentage: number;
  correctAnswers: number;
  totalQuestions: number;
  
  // Attendance
  joinedAt: string;
  leftAt: string;
  attendanceDuration: number; // in minutes
  
  // Feedback
  overallFeedback?: string;
}

interface ClassroomSessionEndProps {
  results: SessionResult;
}

export function ClassroomSessionEnd({ results }: ClassroomSessionEndProps) {
  const navigate = useNavigate();

  const statsCards = [
    {
      label: 'Participation',
      value: `${results.participationRate}%`,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
      description: `${results.attemptedInteractions}/${results.totalInteractions} interactions`
    },
    {
      label: 'Score',
      value: `${results.scorePercentage}%`,
      icon: Trophy,
      color: 'text-amber-600',
      bgColor: 'bg-amber-500/10',
      description: `${results.earnedPoints}/${results.totalPoints} points`
    },
    {
      label: 'Correct Answers',
      value: `${results.correctAnswers}/${results.totalQuestions}`,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
      description: `${Math.round((results.correctAnswers / results.totalQuestions) * 100)}% accuracy`
    },
    {
      label: 'Duration',
      value: `${results.attendanceDuration}m`,
      icon: Clock,
      color: 'text-purple-600',
      bgColor: 'bg-purple-500/10',
      description: `Session was ${results.duration}m`
    },
  ];

  const getPerformanceGrade = () => {
    if (results.scorePercentage >= 90) return { grade: 'A', color: 'text-green-600', bg: 'bg-green-500/10' };
    if (results.scorePercentage >= 80) return { grade: 'B', color: 'text-blue-600', bg: 'bg-blue-500/10' };
    if (results.scorePercentage >= 70) return { grade: 'C', color: 'text-amber-600', bg: 'bg-amber-500/10' };
    if (results.scorePercentage >= 60) return { grade: 'D', color: 'text-orange-600', bg: 'bg-orange-500/10' };
    return { grade: 'F', color: 'text-red-600', bg: 'bg-red-500/10' };
  };

  const performance = getPerformanceGrade();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center">
            <Trophy className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Session Complete!</h1>
          <p className="text-muted-foreground">
            {results.sessionTitle} • {results.presentationTitle}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            by {results.instructor} • {new Date(results.completedAt).toLocaleDateString()}
          </p>
        </motion.div>

        {/* Performance Grade */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className={`border-2 ${performance.bg}`}>
            <CardContent className="p-8 text-center">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${performance.bg} mb-4`}>
                <span className={`text-5xl font-bold ${performance.color}`}>
                  {performance.grade}
                </span>
              </div>
              <h2 className="text-2xl font-bold mb-2">Excellent Performance!</h2>
              <p className="text-muted-foreground">
                You scored {results.scorePercentage}% on this session
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statsCards.map((card, index) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.05 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className={`p-2.5 rounded-xl w-fit ${card.bgColor}`}>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <CardTitle className="text-sm font-medium text-muted-foreground mt-2">
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Detailed Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Session Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Participation Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Participation Rate</span>
                  <span className="text-sm text-muted-foreground">
                    {results.attemptedInteractions}/{results.totalInteractions}
                  </span>
                </div>
                <Progress value={results.participationRate} className="h-2" />
              </div>

              {/* Score Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Score</span>
                  <span className="text-sm text-muted-foreground">
                    {results.earnedPoints}/{results.totalPoints} points
                  </span>
                </div>
                <Progress value={results.scorePercentage} className="h-2" />
              </div>

              {/* Attendance Info */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Joined</p>
                    <p className="text-sm font-medium">
                      {new Date(results.joinedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-medium">{results.attendanceDuration} minutes</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Feedback */}
        {results.overallFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Instructor Feedback
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{results.overallFeedback}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate('/student/classroom')}
          >
            <Home className="h-4 w-4 mr-2" />
            Return to Classroom
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate('/student/classroom')}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            View History
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              // Certificate download would go here
              console.log('Download certificate');
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Certificate
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
