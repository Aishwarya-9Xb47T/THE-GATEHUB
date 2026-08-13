import { KnowledgeGraph, KnowledgeGraphNode, KnowledgeGraphEdge, MultimodalBlock, ExtractedQuestion, StructuredTable, ExtractedImage, CodeBlock, MathFormula } from './types.js';

export class KnowledgeGraphEngine {
  /**
   * Build relational Knowledge Graph linking Topics, Concepts, Questions, Answers, Code, Math, Images, and Tables
   */
  public static buildGraph(
    title: string,
    blocks: MultimodalBlock[],
    questions: ExtractedQuestion[],
    tables: StructuredTable[],
    images: ExtractedImage[],
    codeBlocks: CodeBlock[],
    equations: MathFormula[]
  ): KnowledgeGraph {
    const nodes: KnowledgeGraphNode[] = [];
    const edges: KnowledgeGraphEdge[] = [];

    // Root Document Node
    const docNodeId = 'node_doc_root';
    nodes.push({
      id: docNodeId,
      type: 'topic',
      label: title,
      metadata: { level: 0 },
    });

    // Extract main topic / subtopics from headings or text
    const topicNodes: string[] = [];
    blocks.filter(b => b.type === 'heading' || b.type === 'title').forEach((b, idx) => {
      const topicId = `node_topic_${idx + 1}`;
      nodes.push({
        id: topicId,
        type: 'subtopic',
        label: b.text || `Section ${idx + 1}`,
        metadata: { text: b.text },
      });
      edges.push({
        sourceId: docNodeId,
        targetId: topicId,
        relation: 'contains',
      });
      topicNodes.push(topicId);
    });

    const primaryTopicId = topicNodes[0] || docNodeId;

    // Link Questions and Answers
    questions.forEach(q => {
      const qNodeId = `node_question_${q.id}`;
      nodes.push({
        id: qNodeId,
        type: 'question',
        label: q.stem.substring(0, 50) + (q.stem.length > 50 ? '...' : ''),
        content: q,
      });

      edges.push({
        sourceId: primaryTopicId,
        targetId: qNodeId,
        relation: 'tests',
      });

      if (q.correctAnswer) {
        const ansNodeId = `node_answer_${q.id}`;
        nodes.push({
          id: ansNodeId,
          type: 'definition',
          label: `Answer: ${Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : q.correctAnswer}`,
          metadata: { explanation: q.explanation },
        });
        edges.push({
          sourceId: qNodeId,
          targetId: ansNodeId,
          relation: 'answers',
        });
      }
    });

    // Link Code Blocks
    codeBlocks.forEach(c => {
      const codeNodeId = `node_code_${c.id}`;
      nodes.push({
        id: codeNodeId,
        type: 'code',
        label: `${c.language.toUpperCase()} Code Snippet`,
        content: c.code,
      });
      edges.push({
        sourceId: primaryTopicId,
        targetId: codeNodeId,
        relation: 'illustrates',
      });
    });

    // Link Math Formulas
    equations.forEach(m => {
      const mathNodeId = `node_math_${m.id}`;
      nodes.push({
        id: mathNodeId,
        type: 'equation',
        label: `Equation (${m.type})`,
        content: m.latex,
      });
      edges.push({
        sourceId: primaryTopicId,
        targetId: mathNodeId,
        relation: 'defines',
      });
    });

    // Link Tables
    tables.forEach(t => {
      const tableNodeId = `node_table_${t.id}`;
      nodes.push({
        id: tableNodeId,
        type: 'table',
        label: t.caption || `Structured Table (${t.rowCount}x${t.columnCount})`,
        content: t,
      });
      edges.push({
        sourceId: primaryTopicId,
        targetId: tableNodeId,
        relation: 'illustrates',
      });
    });

    // Link Images
    images.forEach(i => {
      const imgNodeId = `node_image_${i.id}`;
      nodes.push({
        id: imgNodeId,
        type: 'image',
        label: i.caption || 'Extracted Image',
        content: i,
      });
      edges.push({
        sourceId: primaryTopicId,
        targetId: imgNodeId,
        relation: 'illustrates',
      });
    });

    return { nodes, edges };
  }
}
