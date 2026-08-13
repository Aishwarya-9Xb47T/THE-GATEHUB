/**
 * V6 Part 3 — Diagram syntax validation (Mermaid, PlantUML, Graphviz, D2).
 */
export interface DiagramInput {
  type?: string;
  mermaid?: string | unknown;
  caption?: string;
  source?: string | unknown;
}

export interface DiagramValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: string;
}

const MERMAID_STARTERS = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|gitGraph)/i;
const PLANTUML_START = /@startuml/i;
const GRAPHVIZ_START = /^(digraph|graph)\s/i;
const D2_START = /^[a-zA-Z_][\w]*:\s/m;

export function convertFlowchartBlockToMermaid(fc: unknown): string {
  if (typeof fc === "string") return fc;
  if (!fc || typeof fc !== "object") return "";
  const obj = fc as Record<string, unknown>;
  if (typeof obj.mermaid === "string") return obj.mermaid;
  if (typeof obj.code === "string") return obj.code;
  if (Array.isArray(obj.steps)) {
    const lines = ["flowchart TD"];
    const stepMap = new Map<string, string>();
    obj.steps.forEach((s: any, idx: number) => {
      const id = s?.id || `s${idx + 1}`;
      const label = String(s?.label || s?.title || `Step ${idx + 1}`).replace(/"/g, "'");
      stepMap.set(id, `step_${idx + 1}`);
      lines.push(`  step_${idx + 1}["${label}"]`);
    });
    if (Array.isArray(obj.connections)) {
      obj.connections.forEach((c: any) => {
        const from = stepMap.get(c?.from) || c?.from;
        const to = stepMap.get(c?.to) || c?.to;
        if (from && to) {
          const lbl = c?.label ? `|"${String(c.label).replace(/"/g, "'")}"|` : "";
          lines.push(`  ${from} -->${lbl} ${to}`);
        }
      });
    } else if (obj.steps.length > 1) {
      for (let i = 0; i < obj.steps.length - 1; i++) {
        lines.push(`  step_${i + 1} --> step_${i + 2}`);
      }
    }
    return lines.join("\n");
  }
  return "";
}

export function extractStringSource(sourceInput: unknown): string {
  if (typeof sourceInput === "string") return sourceInput;
  if (sourceInput && typeof sourceInput === "object") {
    const converted = convertFlowchartBlockToMermaid(sourceInput);
    if (converted) return converted;
    const obj = sourceInput as Record<string, unknown>;
    if (typeof obj.code === "string") return obj.code;
    if (typeof obj.mermaid === "string") return obj.mermaid;
    if (typeof obj.source === "string") return obj.source;
    if (typeof obj.content === "string") return obj.content;
  }
  if (sourceInput != null) return String(sourceInput);
  return "";
}

function validateMermaid(sourceInput: unknown): DiagramValidationResult {
  const source = extractStringSource(sourceInput);
  const trimmed = source.trim();
  if (!trimmed) return { valid: false, errors: ["Empty diagram"] };
  if (!MERMAID_STARTERS.test(trimmed)) {
    return { valid: false, errors: ["Missing valid Mermaid diagram type"] };
  }
  const openBrackets = (trimmed.match(/\[/g) ?? []).length;
  const closeBrackets = (trimmed.match(/\]/g) ?? []).length;
  if (openBrackets !== closeBrackets) {
    return { valid: false, errors: ["Unbalanced brackets in Mermaid"] };
  }
  return { valid: true, errors: [], normalized: trimmed };
}

function validatePlantUml(sourceInput: unknown): DiagramValidationResult {
  const source = extractStringSource(sourceInput);
  const trimmed = source.trim();
  if (!PLANTUML_START.test(trimmed) || !/@enduml/i.test(trimmed)) {
    return { valid: false, errors: ["PlantUML must include @startuml and @enduml"] };
  }
  return { valid: true, errors: [], normalized: trimmed };
}

function validateGraphviz(sourceInput: unknown): DiagramValidationResult {
  const source = extractStringSource(sourceInput);
  const trimmed = source.trim();
  if (!GRAPHVIZ_START.test(trimmed)) return { valid: false, errors: ["Invalid Graphviz header"] };
  return { valid: true, errors: [], normalized: trimmed };
}

function validateD2(sourceInput: unknown): DiagramValidationResult {
  const source = extractStringSource(sourceInput);
  const trimmed = source.trim();
  if (!D2_START.test(trimmed)) return { valid: false, errors: ["Invalid D2 syntax"] };
  return { valid: true, errors: [], normalized: trimmed };
}

export function validateDiagram(diagram: DiagramInput): DiagramValidationResult {
  if (!diagram || typeof diagram !== "object") {
    return { valid: false, errors: ["Invalid diagram input object"] };
  }
  const rawSource = diagram.mermaid ?? diagram.source ?? "";
  const type = typeof diagram.type === "string" ? diagram.type.toLowerCase() : "";

  if (type.includes("plantuml")) return validatePlantUml(rawSource);
  if (type.includes("graphviz") || type.includes("dot")) return validateGraphviz(rawSource);
  if (type.includes("d2")) return validateD2(rawSource);
  return validateMermaid(rawSource);
}

export function validateAndFilterDiagrams<T extends DiagramInput>(diagrams: T[]): { valid: T[]; invalid: T[] } {
  const valid: T[] = [];
  const invalid: T[] = [];
  if (!Array.isArray(diagrams)) return { valid, invalid };
  for (const d of diagrams) {
    const result = validateDiagram(d);
    if (result.valid && result.normalized) {
      valid.push({ ...d, mermaid: result.normalized });
    } else {
      invalid.push(d);
    }
  }
  return { valid, invalid };
}

export function buildFallbackMermaid(title: string): string {
  const safeTitle = typeof title === "string" ? title.replace(/"/g, "'") : "Course Topic";
  return `flowchart TD\n  A["${safeTitle}"] --> B[Learn]\n  B --> C[Practice]\n  C --> D[Master]`;
}

