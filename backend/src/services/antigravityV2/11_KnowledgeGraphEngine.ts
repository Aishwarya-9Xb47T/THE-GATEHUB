import { V2KnowledgeGraph, V2KnowledgeGraphNode, V2KnowledgeGraphEdge, V2QuestionBlock, V2TableNode, V2ImageNode, V2MathNode, V2CodeNode, V2DiagramNode } from './types.js';

export class KnowledgeGraphEngine {
  /**
   * Build relational Knowledge Graph connecting Document -> Sections -> Questions -> Answers -> Tables/Code/Math/Diagrams
   */
  public static buildGraph(
    title: string,
    questions: V2QuestionBlock[],
    tables: V2TableNode[],
    images: V2ImageNode[],
    codeBlocks: V2CodeNode[],
    equations: V2MathNode[],
    diagrams: V2DiagramNode[]
  ): V2KnowledgeGraph {
    const nodes: V2KnowledgeGraphNode[] = [];
    const edges: V2KnowledgeGraphEdge[] = [];

    const rootId = 'v2_node_root';
    nodes.push({ id: rootId, type: 'topic', label: title });

    questions.forEach(q => {
      const qNodeId = `v2_node_q_${q.id}`;
      nodes.push({ id: qNodeId, type: 'question', label: q.stem.substring(0, 40), content: q });
      edges.push({ sourceId: rootId, targetId: qNodeId, relation: 'tests' });

      if (q.correctAnswer) {
        const aNodeId = `v2_node_ans_${q.id}`;
        nodes.push({ id: aNodeId, type: 'answer', label: `Answer: ${q.correctAnswer}` });
        edges.push({ sourceId: qNodeId, targetId: aNodeId, relation: 'answers' });
      }
    });

    codeBlocks.forEach(c => {
      const cId = `v2_node_code_${c.id}`;
      nodes.push({ id: cId, type: 'code', label: `${c.language.toUpperCase()} Snippet`, content: c.code });
      edges.push({ sourceId: rootId, targetId: cId, relation: 'illustrates' });
    });

    equations.forEach(m => {
      const mId = `v2_node_math_${m.id}`;
      nodes.push({ id: mId, type: 'math', label: 'Math Formula', content: m.latex });
      edges.push({ sourceId: rootId, targetId: mId, relation: 'defines' });
    });

    tables.forEach(t => {
      const tId = `v2_node_tbl_${t.id}`;
      nodes.push({ id: tId, type: 'table', label: t.caption || 'Table', content: t });
      edges.push({ sourceId: rootId, targetId: tId, relation: 'illustrates' });
    });

    return { nodes, edges };
  }
}
