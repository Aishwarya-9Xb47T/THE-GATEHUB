import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";
import {
  consumePendingCompanionLaunch,
  openOfficialCompanionUrl,
  savePendingCompanionLaunch,
} from "@/lib/companionWorkspace";
import { useGoogleIntegration } from "./useGoogleIntegration";
import type { NotebookCell } from "../types";
import type { LatexFileNode } from "../types";

const COLAB_BLANK_URL = "https://colab.research.google.com/#create=true";

interface ColabLaunchOptions {
  universeId: string;
  lessonId: string;
  stepId: string;
  title: string;
  cells: NotebookCell[];
  language: string;
  colabUrl?: string;
  colabDriveFileId?: string;
  enableColab?: boolean;
}

interface OverleafLaunchOptions {
  title: string;
  files: LatexFileNode[];
  overleafUrl?: string;
  enableOverleaf?: boolean;
}

function openExternalTab(url: string, preOpened?: Window | null): boolean {
  if (preOpened && !preOpened.closed) {
    try {
      preOpened.location.href = url;
      return true;
    } catch {
      /* fall through */
    }
  }
  const win = openOfficialCompanionUrl(url, "colab");
  if (win) return true;
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

function openColabTab(url: string, preOpened?: Window | null): boolean {
  return openExternalTab(url, preOpened);
}

function openOverleafTab(url: string, preOpened?: Window | null): boolean {
  if (preOpened && !preOpened.closed) {
    try {
      preOpened.location.href = url;
      return true;
    } catch {
      /* fall through */
    }
  }
  const win = openOfficialCompanionUrl(url, "overleaf");
  if (win) return true;
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

export function useCompanionWorkspace() {
  const toast = useToastStore((s) => s.add);
  const { status, connecting, connect, refresh } = useGoogleIntegration();
  const [launchingColab, setLaunchingColab] = useState(false);
  const [launchingOverleaf, setLaunchingOverleaf] = useState(false);

  const openColab = useCallback(
    async (options: ColabLaunchOptions) => {
      if (options.enableColab === false) return;

      const instructorUrl = options.colabUrl?.trim();
      const preOpened = window.open("about:blank", "_blank");
      if (instructorUrl) {
        if (!openColabTab(instructorUrl, preOpened)) {
          preOpened?.close();
          toast({ title: "Could not open Colab", description: "Allow popups or try again.", variant: "destructive" });
        }
        return;
      }

      setLaunchingColab(true);
      try {
        let googleReady = status.connected;

        if (status.configured && !googleReady) {
          savePendingCompanionLaunch("colab");
          await connect(window.location.href);
          const statusRes = await api<{ connected: boolean }>("/integrations/google/status");
          googleReady = Boolean(statusRes.data?.connected);
          await refresh();
        }

        if (!status.configured) {
          if (!openColabTab(COLAB_BLANK_URL, preOpened)) {
            preOpened?.close();
            toast({ title: "Could not open Colab", description: "Allow popups or try again.", variant: "destructive" });
            return;
          }
          toast({
            title: "Opened Google Colab",
            description: "Add GOOGLE_CLIENT_ID to the server to sync your GateHub notebook to Drive automatically.",
          });
          return;
        }

        if (!googleReady) {
          toast({
            title: "Google sign-in required",
            description: "Connect Google to sync your notebook, or we opened a blank Colab.",
            variant: "destructive",
          });
          openColabTab(COLAB_BLANK_URL, preOpened);
          return;
        }

        const res = await api<{
          success: boolean;
          url: string;
          driveFileId?: string;
          message?: string;
        }>(
          `/integrations/learning-universes/${options.universeId}/lessons/${options.lessonId}/workspaces/${options.stepId}/colab-launch`,
          {
            method: "POST",
            skipLoginRedirect: true,
            body: {
              cells: options.cells.map((c) => ({ type: c.type, source: c.source })),
              language: options.language,
              title: options.title,
              driveFileId: options.colabDriveFileId,
              enableColab: options.enableColab ?? true,
            },
          }
        );

        if (res.error || !res.data?.url) {
          preOpened?.close();
          const needsAuth = res.error?.toLowerCase().includes("connect google") || res.error?.toLowerCase().includes("not connected");
          if (needsAuth) {
            savePendingCompanionLaunch("colab");
            await connect(window.location.href);
            return;
          }

          toast({
            title: "Could not sync notebook",
            description: res.error || "Opening blank Google Colab instead.",
            variant: "destructive",
          });
          openColabTab(COLAB_BLANK_URL, preOpened);
          return;
        }

        if (!openColabTab(res.data.url, preOpened)) {
          preOpened?.close();
          toast({
            title: "Could not open Colab",
            description: "Colab URL copied to clipboard.",
            variant: "destructive",
          });
          try {
            await navigator.clipboard.writeText(res.data.url);
          } catch {
            /* ignore */
          }
          return;
        }

        toast({ title: "Opened Google Colab", description: "Your GateHub notebook was synced to Google Drive." });
      } catch (err: any) {
        toast({
          title: "Colab launch failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
        openColabTab(COLAB_BLANK_URL, preOpened);
      } finally {
        setLaunchingColab(false);
      }
    },
    [connect, refresh, status.configured, status.connected, toast]
  );

  const openOverleaf = useCallback(
    async (options: OverleafLaunchOptions) => {
      if (options.enableOverleaf === false) return;

      const preOpened = window.open("about:blank", "_blank");
      setLaunchingOverleaf(true);
      try {
        const res = await api<{ success: boolean; url: string; hint?: string }>("/integrations/overleaf/launch", {
          method: "POST",
          body: {
            title: options.title,
            overleafUrl: options.overleafUrl,
            enableOverleaf: options.enableOverleaf ?? true,
            files: options.files.map((f) => ({ name: f.name, content: f.content })),
          },
        });

        if (res.error || !res.data?.url) {
          preOpened?.close();
          throw new Error(res.error || "Could not launch Overleaf");
        }

        if (!openOverleafTab(res.data.url, preOpened)) {
          preOpened?.close();
          toast({ title: "Could not open Overleaf", description: "Allow popups or try again.", variant: "destructive" });
          return;
        }
        toast({ title: "Opened Overleaf", description: res.data.hint ?? "Sign in with Google on Overleaf if prompted." });
      } catch (err: any) {
        toast({
          title: "Overleaf launch failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setLaunchingOverleaf(false);
      }
    },
    [toast]
  );

  return {
    openColab,
    openOverleaf,
    launchingColab,
    launchingOverleaf,
    connecting,
    googleConnected: status.connected,
  };
}

/** After Google OAuth completes, resume a companion launch the student started. */
export function useResumeCompanionLaunch(
  googleConnected: boolean,
  onResumeColab?: () => void,
  onResumeOverleaf?: () => void
) {
  useEffect(() => {
    if (!googleConnected) return;
    const pending = consumePendingCompanionLaunch();
    if (!pending) return;
    if (pending.vendor === "colab") onResumeColab?.();
    if (pending.vendor === "overleaf") onResumeOverleaf?.();
  }, [googleConnected, onResumeColab, onResumeOverleaf]);
}
