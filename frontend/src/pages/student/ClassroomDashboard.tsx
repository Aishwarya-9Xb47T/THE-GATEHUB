import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users, 
  Clock, 
  Trophy, 
  QrCode, 
  Link as LinkIcon,
  Search,
  Calendar,
  TrendingUp,
  CheckCircle,
  Play,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ClassroomQrScannerDialog } from '@/components/classroom/ClassroomQrScannerDialog';
import { ClassroomPasteLinkDialog } from '@/components/classroom/ClassroomPasteLinkDialog';
import { buildClassroomJoinPath, isValidRoomCode, normalizeRoomCode } from '@/lib/classroom/joinUrls';
import { useToastStore } from '@/store/toastStore';

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 bg-muted rounded w-1/3" />
      <div className="h-4 bg-muted rounded w-1/2" />
      
      <div className="grid gap-6 app-fluid-grid app-fluid-grid--sm">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="h-4 bg-muted rounded w-20" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardHeader>
          <div className="h-5 bg-muted rounded w-40" />
        </CardHeader>
        <CardContent>
          <div className="h-10 bg-muted rounded" />
        </CardContent>
      </Card>
    </div>
  );
}

interface ClassroomSession {
  id: string;
  title: string;
  instructor: string;
  course: string;
  roomCode: string;
  status: 'upcoming' | 'active' | 'ended';
  scheduledAt?: string;
  participantCount?: number;
  duration?: number;
}

interface StudentStats {
  totalSessions: number;
  completedSessions: number;
  participationRate: number;
  averageScore: number;
}

export function ClassroomDashboard() {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [joinCode, setJoinCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['classroom', 'sessions'],
    queryFn: async () => {
      const res = await api<{ sessions: ClassroomSession[] }>('/classroom-studio/sessions/my');
      if (res.error) throw new Error(res.error);
      return res.data?.sessions ?? [];
    },
    retry: false,
  });

  const { data: stats } = useQuery({
    queryKey: ['classroom', 'stats'],
    queryFn: async () => {
      const res = await api<StudentStats>('/classroom-studio/sessions/stats');
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    retry: false,
  });

  const goJoinPath = (path: string) => {
    navigate(path);
  };

  const handleJoinByCode = () => {
    const code = normalizeRoomCode(joinCode);
    if (!isValidRoomCode(code)) {
      toast({
        title: 'Invalid session code',
        description: 'Enter the 6-digit classroom code from your instructor.',
        variant: 'destructive',
      });
      return;
    }
    navigate(buildClassroomJoinPath(code));
  };

  const handleJoinSession = (session: ClassroomSession) => {
    if (session.roomCode && isValidRoomCode(session.roomCode)) {
      navigate(buildClassroomJoinPath(session.roomCode));
      return;
    }
    // Fallback: live session route by id (after join APIs resolve)
    navigate(`/student/classroom/session/${session.id}`);
  };

  const upcomingSessions = sessions?.filter(s => s.status === 'upcoming') ?? [];
  const activeSessions = sessions?.filter(s => s.status === 'active') ?? [];
  const recentSessions = sessions?.filter(s => s.status === 'ended').slice(0, 5) ?? [];

  const statsCards = [
    { label: 'Total Sessions', value: stats?.totalSessions ?? 0, icon: LayoutDashboard, color: 'text-blue-600', bgColor: 'bg-blue-500/10' },
    { label: 'Completed', value: stats?.completedSessions ?? 0, icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-500/10' },
    { label: 'Participation Rate', value: `${stats?.participationRate ?? 0}%`, icon: TrendingUp, color: 'text-purple-600', bgColor: 'bg-purple-500/10' },
    { label: 'Average Score', value: `${stats?.averageScore ?? 0}%`, icon: Trophy, color: 'text-amber-600', bgColor: 'bg-amber-500/10' },
  ];

  return (
    <div className="space-y-8">
      {sessionsLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div>
            <h1 className="page-title">Classroom Dashboard</h1>
            <p className="mt-1 text-muted-foreground text-lg">Join live sessions and track your classroom participation</p>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-6 app-fluid-grid app-fluid-grid--sm">
            {statsCards.map((card, index) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="border border-border/50 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 bg-card/50 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                    <div className={`p-2.5 rounded-xl ${card.bgColor} shadow-sm border border-border/30`}>
                      <card.icon className={`h-5 w-5 ${card.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold tracking-tight text-foreground">{card.value}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

      {/* Quick Join Section */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Quick Join Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              ref={codeInputRef}
              placeholder="Enter session code (e.g., 833366)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              className="flex-1 h-11"
              inputMode="numeric"
              maxLength={8}
            />
            <Button onClick={handleJoinByCode} disabled={!joinCode.trim()} className="h-11">
              <Search className="h-4 w-4 mr-2" />
              Join
            </Button>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" className="flex-1 h-11" onClick={() => setScanOpen(true)}>
              <QrCode className="h-4 w-4 mr-2" />
              Scan QR
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-11" onClick={() => setPasteOpen(true)}>
              <LinkIcon className="h-4 w-4 mr-2" />
              Paste Link
            </Button>
          </div>
        </CardContent>
      </Card>

      <ClassroomQrScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onJoinPath={goJoinPath}
        onRequestPasteLink={() => setPasteOpen(true)}
        onRequestEnterCode={() => codeInputRef.current?.focus()}
      />
      <ClassroomPasteLinkDialog open={pasteOpen} onOpenChange={setPasteOpen} onJoinPath={goJoinPath} />

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div>
          <h2 className="text-h3 font-display text-foreground mb-6 flex items-center gap-2">
            <Play className="h-5 w-5 text-green-500" />
            Active Sessions
          </h2>
          <div className="grid gap-4 app-fluid-grid app-fluid-grid--md">
            {activeSessions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Card className="border-green-500/50 bg-green-50/50 dark:bg-green-950/20 hover:shadow-lg transition-all cursor-pointer"
                      onClick={() => handleJoinSession(session)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{session.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{session.instructor}</p>
                      </div>
                      <Badge className="bg-green-500 text-white animate-pulse">LIVE</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {session.participantCount ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {session.duration ? `${session.duration} min` : 'In progress'}
                        </span>
                      </div>
                      <Button size="sm">
                        Join Now
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Sessions */}
      {upcomingSessions.length > 0 && (
        <div>
          <h2 className="text-h3 font-display text-foreground mb-6 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            Upcoming Sessions
          </h2>
          <div className="grid gap-4 app-fluid-grid app-fluid-grid--md">
            {upcomingSessions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border-border/50 hover:shadow-lg transition-all hover:-translate-y-1">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{session.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{session.instructor}</p>
                      </div>
                      <Badge variant="outline">Upcoming</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {session.scheduledAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(session.scheduledAt).toLocaleDateString()}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {session.duration ? `${session.duration} min` : 'TBD'}
                        </span>
                      </div>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <div>
          <h2 className="text-h3 font-display text-foreground mb-6">Recent Sessions</h2>
          <div className="grid gap-4 app-fluid-grid app-fluid-grid--md">
            {recentSessions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border-border/50 hover:shadow-lg transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{session.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{session.instructor}</p>
                      </div>
                      <Badge variant="secondary">Ended</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {session.participantCount ?? 0}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm">
                        View Results
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!sessionsLoading && sessions?.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <LayoutDashboard className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No classroom sessions yet</h3>
            <p className="text-muted-foreground mb-6">
              Join a session using a code from your instructor, or wait for upcoming sessions to appear here.
            </p>
            <Button onClick={() => setJoinCode('')}>
              <QrCode className="h-4 w-4 mr-2" />
              Join with Code
            </Button>
          </CardContent>
        </Card>
      )}
        </>
      )}
    </div>
  );
}
