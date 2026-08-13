import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DoorOpen, ArrowRight } from "lucide-react";
import { lookupRoomCode } from "@/lib/liveSession/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToastStore } from "@/store/toastStore";

export function LiveSessionJoinPage() {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim();
    const isPin = /^\d{4}$/.test(trimmed);
    if (!isPin && trimmed.length < 4) {
      toast({ title: "Enter a valid room code or 4-digit PIN", variant: "destructive" });
      return;
    }

    setLoading(true);
    const res = await lookupRoomCode(trimmed);
    setLoading(false);

    if (res.error || !res.data?.data) {
      toast({ title: "Quiz room not found", description: res.error || "Check your code or PIN", variant: "destructive" });
      return;
    }

    navigate(`/live/play/${res.data.data.id}`);
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <DoorOpen className="mx-auto mb-2 h-10 w-10 text-primary" />
          <CardTitle>Join Quiz Room</CardTitle>
          <CardDescription>Enter the room code or 4-digit PIN from your instructor</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="room-code">Room Code or PIN</Label>
            <Input
              id="room-code"
              value={code}
              onChange={(e) => {
                const v = e.target.value;
                setCode(/^\d/.test(v) ? v.replace(/\D/g, "").slice(0, 4) : v.toUpperCase().slice(0, 6));
              }}
              placeholder="ABC123 or 4829"
              className="text-center font-mono text-2xl tracking-widest"
              maxLength={6}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>
          <Button className="w-full" size="lg" onClick={handleJoin} disabled={loading}>
            {loading ? "Looking up..." : "Join Quiz Room"}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
