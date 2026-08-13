import { Upload, FileText, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentSourceGridProps {
  onSelect: (method: "upload" | "google" | "wayground") => void;
  theme?: "dark" | "light";
  title?: string;
}

const CONTENT_SOURCES: Array<{
  id: "upload" | "google" | "wayground";
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  formats: string;
}> = [
  {
    id: "upload",
    label: "Upload Files",
    description: "Provide learning material from your computer",
    icon: Upload,
    formats: "PDF, DOCX, PPTX, TXT, Markdown, CSV, Excel, Images",
  },
  {
    id: "google",
    label: "Google Docs",
    description: "Provide learning material from Google Docs",
    icon: FileText,
    formats: "Google Docs, Google Forms",
  },
  {
    id: "wayground",
    label: "Website URL",
    description: "Provide learning material from a website",
    icon: Globe,
    formats: "Any public URL",
  },
];

export function ContentSourceGrid({
  onSelect,
  theme = "light",
  title = "What would you like to build your quiz from?",
}: ContentSourceGridProps) {
  const isDark = theme === "dark";

  return (
    <div className="space-y-6">
      {title && (
        <div>
          <h2
            className={cn(
              "text-lg font-semibold",
              isDark ? "text-white" : "text-foreground"
            )}
          >
            {title}
          </h2>
          <p
            className={cn(
              "text-sm mt-1",
              isDark ? "text-white/60" : "text-muted-foreground"
            )}
          >
            Select your learning material source.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CONTENT_SOURCES.map((source) => {
          const Icon = source.icon;
          return (
            <button
              key={source.id}
              type="button"
              onClick={() => onSelect(source.id)}
              className={cn(
                "group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all duration-200",
                isDark
                  ? "border-white/10 bg-white/5 hover:border-primary/60 hover:bg-primary/10"
                  : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                  isDark
                    ? "bg-white/10 text-white group-hover:bg-primary/30"
                    : "bg-primary/10 text-primary group-hover:bg-primary/20"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p
                  className={cn(
                    "font-semibold text-sm",
                    isDark ? "text-white" : "text-foreground"
                  )}
                >
                  {source.label}
                </p>
                <p
                  className={cn(
                    "text-xs leading-relaxed",
                    isDark ? "text-white/50" : "text-muted-foreground"
                  )}
                >
                  {source.description}
                </p>
                <p
                  className={cn(
                    "text-xs font-medium",
                    isDark ? "text-primary/70" : "text-primary/80"
                  )}
                >
                  {source.formats}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
