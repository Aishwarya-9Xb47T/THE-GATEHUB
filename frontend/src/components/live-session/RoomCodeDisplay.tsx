import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToastStore } from "@/store/toastStore";

interface RoomCodeDisplayProps {
  roomCode: string;
  joinUrl: string;
  title?: string;
}

export function RoomCodeDisplay({ roomCode, joinUrl, title }: RoomCodeDisplayProps) {
  const toast = useToastStore((s) => s.add);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast({ title: "Room code copied!", variant: "success" });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    toast({ title: "Join link copied!", variant: "success" });
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title || "Join this session"}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="rounded-xl bg-white p-4 shadow-inner">
          <QRCodeSVG value={joinUrl} size={160} level="M" />
        </div>
        <div className="flex flex-1 flex-col gap-4 text-center sm:text-left">
          <div>
            <p className="text-sm text-muted-foreground">Room Code</p>
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-primary">{roomCode}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyCode}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Code
            </Button>
            <Button variant="outline" size="sm" onClick={copyLink}>
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
