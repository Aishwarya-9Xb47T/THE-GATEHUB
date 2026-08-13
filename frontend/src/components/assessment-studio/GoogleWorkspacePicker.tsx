import { useState, useEffect } from "react";
import { FileType, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGoogleImportStatus, getGoogleImportConnectUrl } from "@/lib/assessmentStudio/api";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";

interface GoogleWorkspacePickerProps {
  onFileSelect: (fileId: string, fileName: string) => void;
  theme?: "light" | "dark";
}

export function GoogleWorkspacePicker({ onFileSelect, theme = "light" }: GoogleWorkspacePickerProps) {
  const isDark = theme === "dark";
  const toast = useToastStore((s) => s.add);
  
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    const res = await getGoogleImportStatus();
    setLoading(false);
    if (res.data?.data) {
      setConnected(Boolean(res.data.data.connected));
      setConfigured(res.data.data.configured !== false);
    }
  };

  const handleConnect = async () => {
    if (!configured) {
      toast({ 
        title: "Google OAuth not configured", 
        description: "Contact administrator to set up Google OAuth credentials.",
        variant: "destructive" 
      });
      return;
    }

    setConnecting(true);
    const res = await getGoogleImportConnectUrl(window.location.href);
    setConnecting(false);
    
    if (res.data?.data?.url) {
      window.location.href = res.data.data.url;
    } else {
      toast({ title: "Failed to connect to Google", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className={cn(
        "p-6 rounded-xl border",
        isDark ? "border-white/10 bg-white/5" : "border-border bg-card"
      )}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <p className={cn("font-medium", isDark ? "text-white" : "text-foreground")}>
              Google OAuth not configured
            </p>
            <p className={cn("mt-1 text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>
              Contact your administrator to set up Google OAuth credentials to enable Google Workspace imports.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className={cn(
        "p-8 rounded-xl border text-center",
        isDark ? "border-white/10 bg-white/5" : "border-border bg-card"
      )}>
        <div className={cn(
          "mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4",
          isDark ? "bg-white/10" : "bg-primary/10"
        )}>
          <FileType className={cn("h-8 w-8", isDark ? "text-white" : "text-primary")} />
        </div>
        <h3 className={cn("text-lg font-semibold mb-2", isDark ? "text-white" : "text-foreground")}>
          Connect Google Workspace
        </h3>
        <p className={cn("text-sm mb-6", isDark ? "text-white/60" : "text-muted-foreground")}>
          Connect your Google account to import from Drive, Docs, Forms, and Slides
        </p>
        <Button
          onClick={handleConnect}
          disabled={connecting}
          className="w-full"
        >
          {connecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <FileType className="h-4 w-4 mr-2" />
              Connect Google Account
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn(
        "p-4 rounded-xl border",
        isDark ? "border-white/10 bg-white/5" : "border-border bg-card"
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileType className={cn("h-5 w-5", isDark ? "text-white" : "text-foreground")} />
            <span className={cn("font-medium", isDark ? "text-white" : "text-foreground")}>
              Google Workspace
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={checkStatus}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Google file pickers are not available yet. Connect your account above for future imports.
          </p>
          {[
            { label: "Google Drive", Icon: FileType },
            { label: "Google Docs", Icon: FileType },
            { label: "Google Forms", Icon: FileType },
            { label: "Google Slides", Icon: FileType },
          ].map(({ label, Icon }) => (
            <Button
              key={label}
              variant="outline"
              className="w-full justify-start"
              disabled
              title="Not available yet"
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Soon</span>
            </Button>
          ))}
        </div>
      </div>

      <div className={cn("text-xs", isDark ? "text-white/40" : "text-muted-foreground")}>
        <p className="font-medium mb-1">Recent files will appear here</p>
        <p>Connect to Google Workspace to browse your recent files and import quizzes directly.</p>
      </div>
    </div>
  );
}
