import type { Components } from "react-markdown";
import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MermaidRenderer } from "./MermaidRenderer";

type ContentKind =
  | "tip"
  | "warning"
  | "important"
  | "definition"
  | "note"
  | "example"
  | "case-study"
  | "assignment"
  | "project"
  | "quiz"
  | "research"
  | "reference"
  | "glossary"
  | "interview"
  | "revision";

const CONTENT_RULES: Array<{ kind: ContentKind; label: string; pattern: RegExp }> = [
  { kind: "tip", label: "Tip", pattern: /^(?:\*\*)?(?:tip|pro tip)(?:\*\*)?:\s*/i },
  { kind: "warning", label: "Warning", pattern: /^(?:\*\*)?(?:warning|caution)(?:\*\*)?:\s*/i },
  { kind: "important", label: "Important", pattern: /^(?:\*\*)?important(?:\*\*)?:\s*/i },
  { kind: "definition", label: "Definition", pattern: /^(?:\*\*)?definition(?:\*\*)?:\s*/i },
  { kind: "example", label: "Example", pattern: /^(?:\*\*)?example(?:\s*\d+)?(?:\*\*)?:\s*/i },
  { kind: "case-study", label: "Case Study", pattern: /^(?:\*\*)?case study(?:\*\*)?:\s*/i },
  { kind: "assignment", label: "Assignment", pattern: /^(?:\*\*)?assignment(?:\*\*)?:\s*/i },
  { kind: "project", label: "Project", pattern: /^(?:\*\*)?project(?:\*\*)?:\s*/i },
  { kind: "quiz", label: "Quiz", pattern: /^(?:\*\*)?quiz(?:\*\*)?:\s*/i },
  { kind: "research", label: "Research", pattern: /^(?:\*\*)?(?:research(?:\s+paper)?)(?:\*\*)?:\s*/i },
  { kind: "reference", label: "Reference", pattern: /^(?:\*\*)?(?:reference|further\s+reading)(?:\*\*)?:\s*/i },
  { kind: "glossary", label: "Glossary", pattern: /^(?:\*\*)?glossary(?:\*\*)?:\s*/i },
  { kind: "interview", label: "Interview Question", pattern: /^(?:\*\*)?(?:interview(?:\s+question)?)(?:\*\*)?:\s*/i },
  { kind: "revision", label: "Revision Notes", pattern: /^(?:\*\*)?(?:revision(?:\s+notes)?)(?:\*\*)?:\s*/i },
  { kind: "note", label: "Note", pattern: /^(?:\*\*)?note(?:\*\*)?:\s*/i },
];

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText(node.props.children);
  return "";
}

function detectContentType(text: string): { kind: ContentKind; label: string; rest: string } | null {
  const trimmed = text.trim();
  for (const rule of CONTENT_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        kind: rule.kind,
        label: rule.label,
        rest: trimmed.replace(rule.pattern, "").trim(),
      };
    }
  }
  return null;
}

function ContentCard({
  kind,
  label,
  children,
}: {
  kind: ContentKind;
  label: string;
  children: ReactNode;
}) {
  const useCallout = ["tip", "warning", "important", "definition", "note"].includes(kind);
  const baseClass = useCallout ? "callout" : "content-card";
  const labelClass = useCallout ? "callout__label" : "content-card__label";

  return (
    <div className={cn(baseClass, `${baseClass}--${kind}`)} role="note">
      <span className={labelClass}>{label}</span>
      <div className={useCallout ? "callout__body" : "content-card__body"}>{children}</div>
    </div>
  );
}

function renderDetected(text: string, children: ReactNode) {
  const detected = detectContentType(text);
  if (detected) {
    return (
      <ContentCard kind={detected.kind} label={detected.label}>
        {detected.rest || children}
      </ContentCard>
    );
  }
  return null;
}

export function createLessonMarkdownComponents(): Components {
  return {
    p({ children, node: _node, ..._rest }) {
      const text = nodeText(children);
      return renderDetected(text, children) ?? <p>{children}</p>;
    },
    blockquote({ children, node: _node }) {
      const text = nodeText(children);
      return renderDetected(text, children) ?? <blockquote>{children}</blockquote>;
    },
    h2({ children, node: _node }) {
      const text = nodeText(children);
      return renderDetected(text, children) ?? <h2>{children}</h2>;
    },
    h3({ children, node: _node }) {
      const text = nodeText(children);
      return renderDetected(text, children) ?? <h3>{children}</h3>;
    },
    strong({ children }) {
      return <strong className="font-semibold text-text-primary">{children}</strong>;
    },
    code({ className, children, node: _node, ...props }) {
      const isBlock = Boolean(className);
      const language = className?.replace("language-", "") || "";
      const text = String(children || "").trim();

      if (language === "mermaid" || /^(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram)/i.test(text)) {
        return <MermaidRenderer chart={text} />;
      }

      // Never spread react-markdown `node` onto DOM (becomes node="[object Object]").
      const safeProps = Object.fromEntries(
        Object.entries(props).filter(([k, v]) => k !== "node" && (typeof v !== "object" || v == null))
      );

      return (
        <code className={cn("type-code", isBlock && className)} {...safeProps}>
          {children}
        </code>
      );
    },
    pre({ children, node: _node }) {
      const text = nodeText(children);
      if (/^(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram)/i.test(text.trim())) {
        return <MermaidRenderer chart={text.trim()} />;
      }
      return <pre>{children}</pre>;
    },
    img({ alt, src, title }) {
      if (!src) return null;
      return (
        <figure className="figure">
          <img src={src} alt={alt ?? ""} title={title} loading="lazy" decoding="async" />
          {alt ? <figcaption className="figure__caption">{alt}</figcaption> : null}
        </figure>
      );
    },
    a({ href, children }) {
      const url = typeof href === "string" ? href : "";
      if (!url) {
        return <span className="text-primary underline-offset-4">{children}</span>;
      }
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
          {children}
        </a>
      );
    },
    li({ children, node: _node }) {
      return (
        <li>
          {Children.map(children, (child) => {
            if (typeof child === "string") {
              const detected = renderDetected(child, child);
              if (detected) return detected;
            }
            return child;
          })}
        </li>
      );
    },
    table({ children }) {
      return (
        <div className="my-6 w-full overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-sm">
          <table className="w-full text-left text-sm text-foreground border-collapse">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">{children}</thead>;
    },
    tbody({ children }) {
      return <tbody className="divide-y divide-border/40">{children}</tbody>;
    },
    tr({ children }) {
      return <tr className="hover:bg-muted/30 transition-colors">{children}</tr>;
    },
    th({ children }) {
      return <th className="px-4 py-3 font-semibold">{children}</th>;
    },
    td({ children }) {
      return <td className="px-4 py-3 align-top">{children}</td>;
    },
  };
}
