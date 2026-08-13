import { useEffect, useState } from "react";
import { FileCode2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CodeBlockRenderer } from "./CodeBlockRenderer";
import { CODE_LANGUAGES } from "./codeBlockLanguages";

const DEFAULT_SNIPPET = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}`;

interface CodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent?: string;
  initialLanguage?: string;
  /** When true, empty code can be saved (edit existing block without deleting it). */
  allowEmpty?: boolean;
  onInsert: (content: string, language: string) => void;
}

export function CodeDialog({
  open,
  onOpenChange,
  initialContent = "",
  initialLanguage = "java",
  allowEmpty = false,
  onInsert,
}: CodeDialogProps) {
  const [content, setContent] = useState(initialContent || DEFAULT_SNIPPET);
  const [language, setLanguage] = useState(initialLanguage || "java");

  useEffect(() => {
    if (open) {
      setContent(initialContent || (allowEmpty ? "" : DEFAULT_SNIPPET));
      setLanguage(initialLanguage || "java");
    }
  }, [open, initialContent, initialLanguage, allowEmpty]);

  const canSave = allowEmpty || content.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            Insert code block
          </DialogTitle>
          <DialogDescription>
            Students will see syntax-highlighted code with line numbers and a copy button.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.id} value={lang.id}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CodeBlockRenderer
            content={content}
            language={language}
            readOnly={false}
            editable
            onChange={setContent}
            showLineNumbers
            collapsible={false}
          />
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onInsert(content, language);
              onOpenChange(false);
            }}
            disabled={!canSave}
          >
            {allowEmpty ? "Save code block" : "Insert code block"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
