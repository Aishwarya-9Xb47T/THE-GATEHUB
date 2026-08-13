import { V2ImageNode, V2ChartNode, V2DiagramNode } from './types.js';

export class VisionEngine {
  /**
   * Process visual shapes, images, charts, and diagrams
   */
  public static processVisuals(rawText: string, existingImages?: V2ImageNode[]): {
    images: V2ImageNode[];
    charts: V2ChartNode[];
    diagrams: V2DiagramNode[];
  } {
    const images: V2ImageNode[] = existingImages || [];
    const charts: V2ChartNode[] = [];
    const diagrams: V2DiagramNode[] = [];

    // Parse Mermaid diagram blocks
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/gi;
    let mermaidMatch;
    let diagIdx = 1;

    while ((mermaidMatch = mermaidRegex.exec(rawText)) !== null) {
      const code = mermaidMatch[1];
      const nodes: Array<{ id: string; label: string }> = [];
      const edges: Array<{ fromId: string; toId: string; label?: string }> = [];

      const lines = code.split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach(line => {
        const connMatch = line.match(/([a-zA-Z0-9_-]+)\s*-->(?:\|([^|]+)\|)?\s*([a-zA-Z0-9_-]+)/);
        if (connMatch) {
          const from = connMatch[1];
          const label = connMatch[2] || '';
          const to = connMatch[3];

          if (!nodes.some(n => n.id === from)) nodes.push({ id: from, label: from });
          if (!nodes.some(n => n.id === to)) nodes.push({ id: to, label: to });

          edges.push({ fromId: from, toId: to, label: label || undefined });
        }
      });

      diagrams.push({
        id: `v2_diag_${diagIdx++}`,
        type: 'diagram',
        diagramType: code.includes('sequence') ? 'sequence' : 'flowchart',
        title: `Visual Diagram ${diagIdx}`,
        nodes,
        edges,
        rawCode: code,
      });
    }

    return { images, charts, diagrams };
  }
}
