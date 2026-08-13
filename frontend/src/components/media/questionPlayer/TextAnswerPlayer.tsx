import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TextAnswerPlayerProps {
  type: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TextAnswerPlayer({ type, value, onChange, disabled }: TextAnswerPlayerProps) {
  const inputType = type === "numerical" ? "number" : "text";
  return (
    <div className="space-y-2">
      <Label htmlFor="text-answer-input" className="text-sm text-muted-foreground">
        {type === "fill_blank" ? "Fill in the blank" : type === "numerical" ? "Enter a number" : "Your answer"}
      </Label>
      <Input
        id="text-answer-input"
        type={inputType}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer…"
        className="max-w-md"
      />
    </div>
  );
}
