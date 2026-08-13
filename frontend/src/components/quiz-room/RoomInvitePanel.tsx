import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink, KeyRound, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToastStore } from "@/store/toastStore";

interface RoomInvitePanelProps {
  roomCode: string | null;
  pin: string | null;
  joinUrl: string;
  title?: string;
  description?: string;
  compact?: boolean;
}

export function RoomInvitePanel({
  roomCode,
  pin,
  joinUrl,
  title = "Invite Students",
  description = "Share the room code, PIN, QR code, or link so students can join.",
  compact = false,
}: RoomInvitePanelProps) {
  const toast = useToastStore((s) => s.add);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!`, variant: "success" });
  };

  if (!roomCode && !pin) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Launch this room to generate a join code, PIN, and QR code.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/15 shadow-sm">
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="text-lg">{title}</CardTitle>
        {!compact && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
        <div className="rounded-xl border bg-white p-4 shadow-inner dark:bg-white">
          <QRCodeSVG value={joinUrl} size={compact ? 120 : 168} level="M" />
        </div>

        <div className="flex w-full flex-1 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {roomCode && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Hash className="h-3.5 w-3.5" />
                  Room Code
                </div>
                <p className="font-mono text-3xl font-bold tracking-[0.25em] text-primary">{roomCode}</p>
              </div>
            )}
            {pin && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  PIN
                </div>
                <p className="font-mono text-3xl font-bold tracking-widest text-primary">{pin}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {roomCode && (
              <Button variant="outline" size="sm" onClick={() => copy(roomCode, "Room code")}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Code
              </Button>
            )}
            {pin && (
              <Button variant="outline" size="sm" onClick={() => copy(pin, "PIN")}>
                <KeyRound className="mr-2 h-4 w-4" />
                Copy PIN
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => copy(joinUrl, "Join link")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Copy Link
            </Button>
          </div>

          <p className="break-all text-xs text-muted-foreground">{joinUrl}</p>
        </div>
      </CardContent>
    </Card>
  );
}
