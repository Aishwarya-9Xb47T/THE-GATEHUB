import { cn } from "@/lib/utils";
import { VisualBlockEditor } from "./VisualBlockEditor";

export interface RichContentEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  minRows?: number;
  className?: string;
  inputId?: string;
  autoFocus?: boolean;
  compact?: boolean;
  showTextFormats?: boolean;
  minimalToolbar?: boolean;
}

/**
 * Premium WYSIWYG content editor for Quiz Room.
 * Renders live preview inline — instructors never edit raw markdown for media.
 */
export function RichContentEditor({
  value,
  onChange,
  placeholder = "Click to type your content…",
  label,
  minRows: _minRows,
  className,
  inputId,
  autoFocus,
  compact = false,
  showTextFormats = true,
  minimalToolbar = false,
}: RichContentEditorProps) {
  return (
    <div className={cn("rich-content-editor space-y-2", className)}>
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      )}
      <VisualBlockEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        compact={compact}
        showTextFormats={showTextFormats}
        minimalToolbar={minimalToolbar}
        inputId={inputId}
        autoFocus={autoFocus}
      />
    </div>
  );
}
