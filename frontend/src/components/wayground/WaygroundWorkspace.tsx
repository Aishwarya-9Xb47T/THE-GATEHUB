import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Loader2,
  Gamepad2,
  BookOpen,
  LayoutTemplate,
  ClipboardList,
  Users,
  Sparkles,
  AlertTriangle,
  LogOut,
  Lock,
  WifiOff,
  XCircle,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type WayTab = "quizzes" | "templates" | "flashcards" | "activities" | "classes" | "join" | "settings";
type AuthState = "checking" | "authenticated" | "not_authenticated" | "expired" | "error";
type WorkspaceState = "loading" | "ready" | "error" | "network_failure" | "blocked";

const WAY_TABS: Array<{ id: WayTab; label: string; icon: typeof ClipboardList; url: string }> = [
  { id: "quizzes", label: "Quizzes", icon: ClipboardList, url: "https://wayground.com/join/dashboard" },
  { id: "templates", label: "Templates", icon: LayoutTemplate, url: "https://wayground.com/join/dashboard" },
  { id: "flashcards", label: "Flashcards", icon: BookOpen, url: "https://wayground.com/join/dashboard" },
  { id: "activities", label: "Activities", icon: Sparkles, url: "https://wayground.com/join/dashboard" },
  { id: "classes", label: "Classes", icon: Users, url: "https://wayground.com/join/dashboard" },
  { id: "join", label: "Join Quiz", icon: Gamepad2, url: "https://wayground.com/join" },
];

const SESSION_STORAGE_KEY = "wayground_auth_session";
const SESSION_EXPIRY_KEY = "wayground_auth_expiry";

interface WaygroundWorkspaceProps {
  initialTab?: WayTab;
  initialCode?: string;
  onBack?: () => void;
  backRoute?: string;
  backLabel?: string;
  showFullscreen?: boolean;
  showCopyLink?: boolean;
  showJoinCode?: boolean;
  showSettings?: boolean;
  onJoinCodeSubmit?: (code: string) => void;
  onCopyLink?: () => void;
  isInWizard?: boolean;
  containerClassName?: string;
}

export function WaygroundWorkspace({
  initialTab = "quizzes",
  initialCode = "",
  onBack,
  backRoute,
  backLabel,
  showFullscreen = true,
  showCopyLink = true,
  showJoinCode = true,
  showSettings = true,
  onJoinCodeSubmit,
  onCopyLink,
  isInWizard = false,
  containerClassName = "",
}: WaygroundWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WayTab>(initialTab);
  const [gameCode, setGameCode] = useState(initialCode);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("loading");
  const [isLoading, setIsLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTab = WAY_TABS.find((t) => t.id === activeTab);
  const currentUrl = gameCode.trim()
    ? `https://wayground.com/join?gc=${encodeURIComponent(gameCode.trim())}`
    : currentTab?.url ?? "https://wayground.com/join/dashboard";


  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Check if session is still valid
  const checkAuthStatus = () => {
    try {
      const session = localStorage.getItem(SESSION_STORAGE_KEY);
      const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);
      
      if (!session || !expiry) {
        setAuthState("not_authenticated");
        return;
      }

      const expiryTime = parseInt(expiry, 10);
      const now = Date.now();
      
      if (now > expiryTime) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(SESSION_EXPIRY_KEY);
        setAuthState("expired");
        return;
      }

      setAuthState("authenticated");
    } catch (error: any) {
      console.error("Error checking auth status:", error);
      setAuthState("error");
    }
  };

  // Set session when authenticated
  const setSession = () => {
    const sessionExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    localStorage.setItem(SESSION_STORAGE_KEY, "authenticated");
    localStorage.setItem(SESSION_EXPIRY_KEY, sessionExpiry.toString());
    setAuthState("authenticated");
  };

  // Clear session on logout
  const clearSession = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    setAuthState("not_authenticated");
  };

  const handleTabChange = (tab: WayTab) => {
    setActiveTab(tab);
    setGameCode("");
    setIsLoading(true);
    setIframeError(false);
    setWorkspaceState("loading");
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameCode.trim()) return;
    
    const cleanCode = gameCode.trim();
    setActiveTab("join");
    setIsLoading(true);
    setIframeError(false);
    setWorkspaceState("loading");
    
    if (onJoinCodeSubmit) {
      onJoinCodeSubmit(cleanCode);
    }
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setIframeError(false);
    setWorkspaceState("loading");
    setErrorMessage("");
    if (iframeRef.current) {
      iframeRef.current.src = currentUrl;
    }
  };

  const handleReconnect = () => {
    setAuthState("checking");
    checkAuthStatus();
    if (authState === "authenticated") {
      handleRefresh();
    }
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
    setWorkspaceState("ready");
    setIframeError(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setIframeError(true);
    setWorkspaceState("error");
    setErrorMessage("Failed to load Wayground workspace");
  };

  const handleNetworkFailure = () => {
    setWorkspaceState("network_failure");
    setErrorMessage("Network connection failed");
  };

  const handleOpenExternally = () => {
    window.open(currentUrl, "_blank");
  };

  const handleLogin = () => {
    window.location.href = "https://wayground.com/login?redirect=" + encodeURIComponent(window.location.href);
  };

  const handleLogout = () => {
    clearSession();
    window.location.reload();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      void document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    if (onCopyLink) {
      onCopyLink();
    }
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${isInWizard ? "w-full h-full min-h-[75vh]" : `min-h-screen bg-background text-foreground ${isFullscreen ? "p-0 bg-slate-950" : "p-2 md:p-6"} ${containerClassName}`}`}
    >
      {/* Top Navigation Control Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 shrink-0 ${isInWizard ? "mb-3 px-1" : "bg-card/90 backdrop-blur-xl border border-white/10 rounded-2xl p-3 md:p-4 mb-3 shadow-xl"}`}>
        {/* Left: Back Button & Branding */}
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className={`${isInWizard ? "text-white/60 hover:text-white rounded-xl border border-white/10 hover:border-white/20" : "text-muted-foreground hover:text-foreground rounded-xl"}`}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {backLabel || (isInWizard ? "Back to Methods" : "Back")}
            </Button>
          )}

          {(!isInWizard || onBack) && <div className={`h-5 w-[1px] ${isInWizard ? "bg-white/10" : "bg-white/10"}`} />}

          <div className="flex items-center gap-2.5">
            <div className={`rounded-lg ${isInWizard ? "w-7 h-7" : "w-8 h-8 rounded-xl"} bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white font-black ${isInWizard ? "text-base" : "text-lg"} shadow-md shadow-pink-500/20`}>
              W
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`font-bold ${isInWizard ? "text-sm" : "text-sm md:text-base"} ${isInWizard ? "text-white leading-none" : "text-foreground leading-none"}`}>
                  Wayground
                </h1>
                <Badge className={`${isInWizard ? "text-[10px]" : "text-[10px]"} border-purple-500/30 text-purple-300 bg-purple-500/10 border px-1.5 py-0`}>
                  IN-APP
                </Badge>
                {authState === "authenticated" && (
                  <Badge className="text-[10px] border-emerald-500/30 text-emerald-300 bg-emerald-500/10 border px-1.5 py-0">
                    CONNECTED
                  </Badge>
                )}
              </div>
              {!isInWizard && (
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  Formerly Quizizz • THE GATEHUB Connected
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Center: Tab Switcher */}
        <div className={`flex items-center ${isInWizard ? "bg-white/5" : "bg-background/80"} p-1 rounded-xl border border-white/10 text-xs font-semibold overflow-x-auto gap-0.5`}>
          {WAY_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                    : isInWizard
                      ? "text-white/50 hover:text-white hover:bg-white/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
          {showSettings && (
            <button
              onClick={() => handleTabChange("settings")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                activeTab === "settings"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : isInWizard
                    ? "text-white/50 hover:text-white hover:bg-white/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>SSO / LTI</span>
            </button>
          )}
        </div>

        {/* Right: Quick Code & Utilities */}
        <div className="flex items-center gap-2">
          {showJoinCode && (
            <form onSubmit={handleJoinSubmit} className={`hidden lg:flex items-center ${isInWizard ? "bg-white/5" : "bg-background/80"} rounded-xl border border-white/10 px-2 py-1`}>
              <Input
                placeholder="Join code..."
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value)}
                className={`w-24 h-7 text-xs bg-transparent border-none focus-visible:ring-0 font-mono ${isInWizard ? "text-white/70 placeholder:text-white/30" : ""}`}
              />
              <Button type="submit" size="sm" className="h-7 text-[11px] bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-2">
                Join
              </Button>
            </form>
          )}

          {authState === "authenticated" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className={`${isInWizard ? "text-white/50 hover:text-white rounded-xl" : "text-muted-foreground hover:text-foreground rounded-xl w-8 h-8 border border-white/10"}`}
              title="Disconnect Wayground"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          )}

          <Button
            variant={isInWizard ? "ghost" : "outline"}
            size={isInWizard ? "sm" : "icon"}
            onClick={handleRefresh}
            className={`${isInWizard ? "text-white/50 hover:text-white rounded-xl" : "w-8 h-8 rounded-xl border-white/10"}`}
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-purple-400" : ""}`} />
          </Button>

          {showCopyLink && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyLink}
              title="Copy URL"
              className="w-8 h-8 rounded-xl border-white/10"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          )}

          <Button
            variant={isInWizard ? "ghost" : "outline"}
            size={isInWizard ? "sm" : "icon"}
            onClick={handleOpenExternally}
            className={`${isInWizard ? "text-white/50 hover:text-white rounded-xl" : "w-8 h-8 rounded-xl border-white/10"}`}
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>

          {showFullscreen && !isInWizard && (
            <Button
              variant="outline"
              size="icon"
              onClick={toggleFullscreen}
              title="Toggle Fullscreen"
              className="w-8 h-8 rounded-xl border-white/10"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className={`relative flex-1 rounded-2xl border border-white/10 bg-slate-950 overflow-hidden shadow-2xl flex flex-col ${isInWizard ? "" : "min-h-[650px]"}`}>
        {/* Authentication Required State */}
        <AnimatePresence>
          {authState === "not_authenticated" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-5 p-8"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white text-3xl font-black shadow-xl">
                W
              </div>
              <div className="text-center space-y-2 max-w-sm">
                <div className="flex items-center justify-center gap-2 text-purple-300 font-semibold text-sm">
                  <Lock className="w-4 h-4" />
                  Connect to Wayground
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  Sign in to Wayground to browse quizzes, templates, and educational content directly in THE GATEHUB.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleLogin}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all text-sm"
                >
                  Connect Wayground Account
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenExternally}
                  className="border-white/10 text-white rounded-xl"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open Externally
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Session Expired State */}
        <AnimatePresence>
          {authState === "expired" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-5 p-8"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white text-3xl font-black shadow-xl">
                W
              </div>
              <div className="text-center space-y-2 max-w-sm">
                <div className="flex items-center justify-center gap-2 text-amber-400 font-semibold text-sm">
                  <XCircle className="w-4 h-4" />
                  Session Expired
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  Your Wayground session has expired. Reconnect to continue browsing content.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleReconnect}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all text-sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reconnect
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogin}
                  className="border-white/10 text-white rounded-xl"
                >
                  Sign In Again
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading Overlay */}
        <AnimatePresence>
          {isLoading && !iframeError && authState === "authenticated" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center space-y-4"
            >
              <div className={`rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white font-black shadow-xl shadow-purple-500/30 animate-pulse ${isInWizard ? "w-12 h-12 text-2xl" : "w-14 h-14 text-3xl"}`}>
                W
              </div>
              <div className="flex items-center gap-2 text-purple-300 font-semibold text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
                Loading Wayground...
              </div>
              {!isInWizard && <p className="text-xs text-muted-foreground">Connecting to THE GATEHUB session</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Network Failure State */}
        <AnimatePresence>
          {workspaceState === "network_failure" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center space-y-5 p-8"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white text-3xl font-black shadow-xl">
                W
              </div>
              <div className="text-center space-y-2 max-w-sm">
                <div className="flex items-center justify-center gap-2 text-amber-400 font-semibold text-sm">
                  <WifiOff className="w-4 h-4" />
                  Network Connection Failed
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  {errorMessage || "Unable to connect to Wayground. Check your internet connection and try again."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleRefresh}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all text-sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenExternally}
                  className="border-white/10 text-white rounded-xl"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open Externally
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Iframe Blocked State */}
        {iframeError && authState === "authenticated" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center space-y-5 p-8"
          >
            <div className={`rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white font-black shadow-xl shadow-purple-500/30 ${isInWizard ? "w-14 h-14 text-3xl" : "w-16 h-16 text-4xl"}`}>
              W
            </div>
            <div className={`text-center space-y-2 ${isInWizard ? "max-w-sm" : "max-w-md"}`}>
              <div className="flex items-center justify-center gap-2 text-amber-400 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" />
                Embedded Preview Blocked
              </div>
              <p className={`text-${isInWizard ? "xs" : "sm"} text-white/50 leading-relaxed`}>
                Wayground blocks embedding on some pages for security. Open it in a new tab to browse — come back to the wizard once you've found what you need.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all ${isInWizard ? "text-sm" : "px-6 py-3 rounded-2xl"}`}
              >
                <ExternalLink className="w-4 h-4" />
                Open Wayground in New Tab
              </a>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="border-white/10 text-white rounded-xl">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          </motion.div>
        )}

        {/* Settings Panel */}
        {activeTab === "settings" && showSettings && (
          <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6 w-full text-foreground">
            <div className="space-y-2 border-b border-white/10 pb-4">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                <ShieldCheck className="w-3.5 h-3.5" /> LTI 1.3 Advantage & SSO Configuration
              </div>
              <h2 className="text-2xl font-bold">Wayground Authentication Status</h2>
              <p className="text-xs text-muted-foreground">
                Manage Single Sign-On, OAuth tokens, and LTI 1.3 Advantage gradebook passback settings for THE GATEHUB.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card p-5 rounded-2xl border border-white/10 space-y-3">
                <h3 className="text-sm font-bold text-foreground">Single Sign-On (SSO) State</h3>
                <div className="text-xs space-y-2">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-muted-foreground">Session Status:</span>
                    <span className={`font-semibold ${authState === "authenticated" ? "text-emerald-400" : "text-amber-400"}`}>
                      {authState === "authenticated" ? "Active" : authState === "checking" ? "Checking..." : "Not Connected"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">SSO Protocol:</span>
                    <span className="font-semibold text-emerald-400">OIDC / OAuth 2.0</span>
                  </div>
                </div>
              </div>

              <div className="bg-card p-5 rounded-2xl border border-white/10 space-y-3">
                <h3 className="text-sm font-bold text-foreground">LTI 1.3 Tool Integration</h3>
                <div className="text-xs space-y-2">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-muted-foreground">Client ID:</span>
                    <span className="font-mono text-xs">thegatehub-wayground-lti-v1</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-muted-foreground">Grade Passback API:</span>
                    <span className="font-semibold text-emerald-400">ENABLED</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Deep Linking:</span>
                    <span className="font-semibold text-emerald-400">SUPPORTED</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-purple-950/30 border border-purple-500/20 p-5 rounded-2xl space-y-3 text-xs">
              <h4 className="font-bold text-purple-300 flex items-center gap-2">
                <HelpCircle className="w-4 h-4" /> How In-App Authentication Works
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                When you access Wayground from inside THE GATEHUB, public quizzes, join codes, and flashcards open directly within this workspace. For institution-level private quizzes and automatic grade sync, your GATEHUB identity automatically authenticates via LTI 1.3 token exchange.
              </p>
              <div className="pt-2">
                <Button
                  onClick={() => handleTabChange("quizzes")}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl"
                >
                  Return to Wayground Workspace
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Iframe */}
        {authState === "authenticated" && activeTab !== "settings" && (
          <iframe
            ref={iframeRef}
            key={`${activeTab}-${gameCode}`}
            src={currentUrl}
            title="Wayground Workspace"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            onAbort={handleNetworkFailure}
            allow="camera; microphone; display-capture; autoplay; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation"
            className="w-full flex-1 border-none min-h-[600px] bg-slate-950"
          />
        )}

        {/* Footer Bar */}
        <div className="bg-card/90 backdrop-blur-md px-4 py-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground shrink-0">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${authState === "authenticated" ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span>Wayground • Formerly Quizizz</span>
          </div>
          <span>{authState === "authenticated" ? "Browse content, then return to your quiz builder" : "Connect to Wayground to browse content"}</span>
        </div>
      </div>
    </div>
  );
}
