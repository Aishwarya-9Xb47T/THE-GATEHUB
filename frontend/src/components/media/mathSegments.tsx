import { BlockMath, InlineMath } from "react-katex";

export type MathSegment =
  | { kind: "text"; value: string }
  | { kind: "inline"; value: string }
  | { kind: "block"; value: string };

/** Split markdown source into text and LaTeX segments ($ inline, $$ block). */
export function parseMathSegments(source: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const blockRe = /\$\$([\s\S]*?)\$\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (!text) return;
    const inlineParts = splitInlineMath(text);
    segments.push(...inlineParts);
  };

  while ((match = blockRe.exec(source)) !== null) {
    pushText(source.slice(lastIndex, match.index));
    segments.push({ kind: "block", value: match[1]!.trim() });
    lastIndex = match.index + match[0].length;
  }
  pushText(source.slice(lastIndex));
  return segments.length ? segments : [{ kind: "text", value: source }];
}

function splitInlineMath(text: string): MathSegment[] {
  const out: MathSegment[] = [];
  const inlineRe = /\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "inline", value: m[1]!.trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

export function MathSegmentView({ segment }: { segment: MathSegment }) {
  if (segment.kind === "text") return null;
  try {
    if (segment.kind === "block") {
      return (
        <div className="my-3 overflow-x-auto">
          <BlockMath math={segment.value} />
        </div>
      );
    }
    return <InlineMath math={segment.value} />;
  } catch {
    return <code className="rounded bg-muted px-1 text-sm">{segment.value}</code>;
  }
}
