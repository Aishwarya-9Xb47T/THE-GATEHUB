import { useRef } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Copy, Download, ExternalLink, Share2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import {
  buildClassroomJoinUrl,
  isCrossDeviceShareUnsafe,
  normalizeRoomCode,
} from "@/lib/classroom/joinUrls";

interface SessionQrPanelProps {
  roomCode: string;
  /** Optional override; defaults to canonical shareable join URL */
  joinUrl?: string;
}

export function SessionQrPanel({ roomCode, joinUrl }: SessionQrPanelProps) {
  const toast = useToastStore((s) => s.add);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const code = normalizeRoomCode(roomCode);
  const url = joinUrl || buildClassroomJoinUrl(code);
  const crossDeviceUnsafe = isCrossDeviceShareUnsafe();

  const copy = async (text: string, successTitle: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: successTitle });
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard access was blocked. Select and copy the link manually.",
        variant: "destructive",
      });
    }
  };

  const downloadQr = () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) {
      toast({ title: "Download failed", description: "QR canvas unavailable.", variant: "destructive" });
      return;
    }
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `classroom-${code || "session"}-qr.png`;
    a.click();
    toast({ title: "QR downloaded" });
  };

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Join Classroom",
          text: `Join with code ${code}`,
          url,
        });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    await copy(url, "Classroom link copied.");
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="rounded-lg bg-white p-3 shadow-inner border relative">
        <QRCodeSVG value={url} size={140} level="M" includeMargin />
        {/* Hidden canvas for PNG download */}
        <div ref={canvasWrapRef} className="absolute -left-[9999px] top-0 opacity-0 pointer-events-none" aria-hidden>
          <QRCodeCanvas value={url} size={512} level="M" includeMargin />
        </div>
      </div>
      <div className="flex-1 space-y-3 text-center sm:text-left w-full">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Session Code</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-primary">{code}</p>
        </div>
        {crossDeviceUnsafe && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-left text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This QR uses <strong>localhost</strong>, which phones cannot open. For cross-device testing set{" "}
              <code className="font-mono">VITE_PUBLIC_APP_URL=http://&lt;LAN-IP&gt;:5173</code> and open the app via that LAN
              address (Vite <code className="font-mono">host: true</code>).
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
          <Button variant="outline" size="sm" onClick={() => void copy(code, "Session code copied.")}>
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Copy Code
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copy(url, "Classroom link copied.")}>
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Copy Link
          </Button>
          <Button variant="outline" size="sm" onClick={downloadQr}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download QR
          </Button>
          <Button variant="outline" size="sm" onClick={() => void share()}>
            <Share2 className="w-3.5 h-3.5 mr-1.5" />
            Share
          </Button>
        </div>
        <p className="text-xs text-muted-foreground break-all">{url}</p>
      </div>
    </div>
  );
}
