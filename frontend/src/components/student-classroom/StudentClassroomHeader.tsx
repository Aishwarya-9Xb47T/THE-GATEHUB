import React from 'react';
import { Wifi, WifiOff, Loader2, LogOut, BookOpen, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  presentationTitle: string;
  instructorName: string;
  roomCode: string;
  connectionStatus: 'connected' | 'disconnected' | 'recovering';
  slideInfo?: string; // e.g. "3 / 12"
  onLeave: () => void;
}

export function StudentClassroomHeader({
  title,
  presentationTitle,
  instructorName,
  roomCode,
  connectionStatus,
  slideInfo,
  onLeave,
}: Props) {
  return (
    <header className="border-b border-white/10 bg-slate-950/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 max-w-[1800px] mx-auto">
        {/* Left — session info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold tracking-[.18em] text-emerald-300 hidden sm:block">LIVE</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-white truncate max-w-[160px] md:max-w-sm">
              {title || presentationTitle}
            </h1>
            <p className="text-xs text-slate-400 truncate">
              <BookOpen className="inline w-3 h-3 mr-1" />
              {instructorName}
            </p>
          </div>
        </div>

        {/* Right — status + controls */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {slideInfo && (
            <span className="hidden md:flex items-center gap-1 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              {slideInfo}
            </span>
          )}

          <Badge
            variant="outline"
            className={
              connectionStatus === 'connected'
                ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
                : connectionStatus === 'recovering'
                  ? 'text-amber-400 border-amber-400/30 bg-amber-400/10'
                  : 'text-red-400 border-red-400/30 bg-red-400/10'
            }
          >
            {connectionStatus === 'connected' ? (
              <Wifi className="h-3 w-3 mr-1" />
            ) : connectionStatus === 'recovering' ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <WifiOff className="h-3 w-3 mr-1" />
            )}
            <span className="hidden sm:inline">
              {connectionStatus === 'connected' ? 'Live' : connectionStatus === 'recovering' ? 'Reconnecting' : 'Offline'}
            </span>
          </Badge>

          <Badge variant="outline" className="border-white/20 text-slate-300 bg-white/5 font-mono text-xs">
            {roomCode}
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={onLeave}
            className="text-slate-400 hover:text-red-400 hover:bg-red-400/10 h-8 px-2 md:px-3"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline ml-1.5">Leave</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
