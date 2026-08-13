import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Calendar, 
  Clock, 
  Trophy, 
  Users, 
  TrendingUp,
  Filter,
  Search,
  ChevronRight,
  Award
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface SessionRecord {
  id: string;
  title: string;
  presentationTitle: string;
  instructor: string;
  roomCode: string;
  completedAt: string;
  duration: number;
  participationRate: number;
  scorePercentage: number;
  earnedPoints: number;
  totalPoints: number;
  correctAnswers: number;
  totalQuestions: number;
  attendanceDuration: number;
}

export function ClassroomHistory() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['classroom', 'history'],
    queryFn: async () => {
      const res = await api<{ sessions: SessionRecord[] }>('/classroom-studio/sessions/history');
      if (res.error) throw new Error(res.error);
      return res.data?.sessions ?? [];
    },
  });

  const filteredSessions = sessions?.filter(session => {
    const matchesSearch = 
      session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.presentationTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.instructor.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = 
      filter === 'all' ||
      (filter === 'high' && session.scorePercentage >= 80) ||
      (filter === 'medium' && session.scorePercentage >= 60 && session.scorePercentage < 80) ||
      (filter === 'low' && session.scorePercentage < 60);
    
    return matchesSearch && matchesFilter;
  }) ?? [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-500/10 border-green-500/30';
    if (score >= 60) return 'text-blue-600 bg-blue-500/10 border-blue-500/30';
    return 'text-amber-600 bg-amber-500/10 border-amber-500/30';
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  };

  const stats = sessions ? {
    totalSessions: sessions.length,
    averageScore: sessions.length > 0 
      ? Math.round(sessions.reduce((sum, s) => sum + s.scorePercentage, 0) / sessions.length)
      : 0,
    totalPoints: sessions.reduce((sum, s) => sum + s.earnedPoints, 0),
    totalDuration: sessions.reduce((sum, s) => sum + s.attendanceDuration, 0),
  } : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Session History</h1>
        <p className="mt-1 text-muted-foreground text-lg">View your past classroom sessions and performance</p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-4 app-fluid-grid app-fluid-grid--sm">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSessions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageScore}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Points</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPoints}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDuration}m</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                All
              </Button>
              <Button
                variant={filter === 'high' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('high')}
              >
                High (80%+)
              </Button>
              <Button
                variant={filter === 'medium' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('medium')}
              >
                Medium (60-79%)
              </Button>
              <Button
                variant={filter === 'low' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('low')}
              >
                Low (&lt;60%)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session List */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 animate-pulse">
                <div className="h-6 bg-muted rounded w-3/4 mb-4" />
                <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No sessions found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery || filter !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'You haven\'t joined any classroom sessions yet'}
            </p>
            {!searchQuery && filter === 'all' && (
              <Button onClick={() => navigate('/student/classroom/join')}>
                Join a Session
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredSessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="hover:shadow-lg transition-all cursor-pointer"
                    onClick={() => navigate(`/student/classroom/session-end/${session.id}`)}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">{session.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {session.roomCode}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {session.presentationTitle} • by {session.instructor}
                      </p>
                      
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {new Date(session.completedAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {session.attendanceDuration}m
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          {session.participationRate}% participation
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2 ml-4">
                      <div className={`px-3 py-1 rounded-lg border ${getScoreColor(session.scorePercentage)}`}>
                        <span className="text-lg font-bold">{session.scorePercentage}%</span>
                        <span className="text-xs ml-1">({getScoreGrade(session.scorePercentage)})</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {session.earnedPoints}/{session.totalPoints} pts
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
