import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Upload, Clock, Users, Play, MoreVertical, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToastStore } from "@/store/toastStore";
import { apiUrl, getToken } from "@/lib/api";

interface Presentation {
  id: string;
  title: string;
  description?: string;
  sourceType: string;
  thumbnail?: string;
  status: string;
  createdAt: string;
  _count: { slides: number; sessions: number };
}

export function InteractiveClassroomDashboard() {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "ready" | "archived">("all");

  useEffect(() => {
    fetchPresentations();
  }, []);

  const fetchPresentations = async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      console.info("[Classroom dashboard] Loading presentations");
      const response = await fetch(apiUrl("/api/classroom-studio/presentations"), {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to load presentations");
      const data = await response.json();
      console.info("[Classroom dashboard] Presentations loaded", { count: data.length });
      setPresentations(data);
    } catch (error: any) {
      console.error("Failed to fetch presentations:", error);
      toast({
        title: "Error",
        description: error instanceof DOMException && error.name === "AbortError" ? "Loading presentations timed out. Please retry." : "Failed to load presentations",
        variant: "destructive",
      });
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  const handleStartSession = async (presentation: Presentation) => {
    console.log('[ClassroomDashboard] Starting session', { presentationId: presentation.id, title: presentation.title });
    try {
      const response = await fetch(apiUrl("/api/classroom-studio/sessions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ presentationId: presentation.id, title: presentation.title }),
      });
      console.log('[ClassroomDashboard] Start session response', { status: response.status, ok: response.ok });
      if (!response.ok) throw new Error("Failed to start session");
      const session = await response.json();
      console.log('[ClassroomDashboard] Session created', { sessionId: session.id, roomCode: session.roomCode, status: session.status });
      navigate(`/instructor/interactive-classroom/session/${session.id}`);
    } catch (error: any) {
      console.error("Failed to start classroom session:", error);
      toast({ title: "Error", description: "Failed to start the classroom session", variant: "destructive" });
    }
  };

  const filteredPresentations = presentations.filter((presentation) => {
    const matchesSearch = presentation.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === "all" || presentation.status === filter;
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "ready":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "archived":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case "powerpoint":
        return "📊";
      case "google_slides":
        return "📑";
      case "pdf":
        return "📄";
      default:
        return "📝";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Interactive Classroom Studio</h1>
              <p className="text-muted-foreground mt-1">
                Create engaging presentations with real-time student interaction
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => navigate("/instructor/interactive-classroom/create")}
              >
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button onClick={() => navigate("/instructor/interactive-classroom/create")}>
                <Plus className="w-4 h-4 mr-2" />
                New Presentation
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search presentations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {(["all", "draft", "ready", "archived"] as const).map((status) => (
                <Button
                  key={status}
                  variant={filter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(status)}
                  className="capitalize"
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {filteredPresentations.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2">No presentations yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first interactive presentation to get started
            </p>
            <Button onClick={() => navigate("/instructor/interactive-classroom/create")}>
              <Plus className="w-4 h-4 mr-2" />
              Create Presentation
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPresentations.map((presentation) => (
              <Card
                key={presentation.id}
                className="group hover:shadow-lg transition-all cursor-pointer"
                onClick={() => navigate(`/instructor/interactive-classroom/${presentation.id}/edit`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getSourceIcon(presentation.sourceType)}</span>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{presentation.title}</CardTitle>
                        <CardDescription className="text-sm">
                          {presentation._count?.slides ?? 0} slides
                        </CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/instructor/interactive-classroom/${presentation.id}/edit`);
                        }}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleStartSession(presentation);
                        }}>
                          <Play className="w-4 h-4 mr-2" />
                          Start Session
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Delete logic
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {presentation._count?.sessions ?? 0} sessions
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(presentation.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Badge className={getStatusColor(presentation.status)} variant="outline">
                      {presentation.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
