/**
 * Semantic Reconstructor & Relationship Resolver
 * Resolves graph relationships and attaches structured tables, equations, code blocks, 
 * diagrams, images, matching pairs, and passages directly to parent questions.
 */

import { EducationalObjectGraph, EducationalNode } from './EducationalObjectGraph.js';

export class SemanticReconstructor {
  static reconstruct(eog: EducationalObjectGraph): EducationalObjectGraph {
    console.log('[SemanticReconstructor] Starting semantic reconstruction and relationship resolution');

    const allNodes = eog.getAllNodes();
    const questions = eog.getNodesByType('Question');
    const tables = eog.getNodesByType('Table');
    const equations = eog.getNodesByType('Equation');
    const codeBlocks = eog.getNodesByType('CodeBlock');
    const images = eog.getNodesByType('Image');
    const diagrams = eog.getNodesByType('Diagram');
    const passages = eog.getNodesByType('ReadingPassage').concat(eog.getNodesByType('CaseStudy'));

    // 1. Resolve Tables to nearest adjacent question
    for (const table of tables) {
      const parentQ = this.findNearestQuestion(table, questions, allNodes);
      if (parentQ) {
        eog.addEdge({
          id: `edge_table_${table.id}_${parentQ.id}`,
          sourceId: table.id,
          targetId: parentQ.id,
          relationship: 'references_table',
          confidence: 0.95,
        });

        // Store structured table data in parent question attributes
        if (!parentQ.attributes.tables) parentQ.attributes.tables = [];
        const tableObj = {
          id: table.id,
          html: table.content,
          headers: table.attributes?.headers || [],
          rows: table.attributes?.rows || table.attributes?.cells || [],
          alignments: table.attributes?.alignments,
          caption: table.attributes?.caption || '',
          attributes: table.attributes,
        };
        parentQ.attributes.tables.push(tableObj);
        if (!parentQ.attributes.table) {
          parentQ.attributes.table = tableObj;
        }
      }
    }

    // 2. Resolve Equations to parent question or option
    for (const eq of equations) {
      const parentQ = this.findNearestQuestion(eq, questions, allNodes);
      if (parentQ) {
        eog.addEdge({
          id: `edge_eq_${eq.id}_${parentQ.id}`,
          sourceId: eq.id,
          targetId: parentQ.id,
          relationship: 'references_equation',
          confidence: 0.95,
        });

        if (!parentQ.attributes.equations) parentQ.attributes.equations = [];
        parentQ.attributes.equations.push({
          id: eq.id,
          latex: eq.content,
          attributes: eq.attributes,
        });
      }
    }

    // 3. Resolve Code Blocks to parent question
    for (const code of codeBlocks) {
      const parentQ = this.findNearestQuestion(code, questions, allNodes);
      if (parentQ) {
        eog.addEdge({
          id: `edge_code_${code.id}_${parentQ.id}`,
          sourceId: code.id,
          targetId: parentQ.id,
          relationship: 'attached_to',
          confidence: 0.95,
        });

        parentQ.attributes.code = {
          code: code.content,
          language: code.attributes?.language || this.detectLanguage(code.content),
          indentation: code.attributes?.indentation || 0,
        };
      }
    }

    // 4. Resolve Images and Diagrams to parent question
    const mediaNodes = [...images, ...diagrams];
    for (const media of mediaNodes) {
      const parentQ = this.findNearestQuestion(media, questions, allNodes);
      if (parentQ) {
        eog.addEdge({
          id: `edge_media_${media.id}_${parentQ.id}`,
          sourceId: media.id,
          targetId: parentQ.id,
          relationship: media.type === 'Diagram' ? 'illustrates' : 'references_image',
          confidence: 0.9,
        });

        let rawUrl = media.attributes?.dataUrl || media.attributes?.url || media.content || '';
        if (typeof rawUrl === 'string') {
          const matchSrc = rawUrl.match(/src=["']([^"']+)["']/i);
          if (matchSrc?.[1]) {
            rawUrl = matchSrc[1];
          }
        }

        if (!parentQ.attributes.images) parentQ.attributes.images = [];
        parentQ.attributes.images.push({
          id: media.id,
          dataUrl: rawUrl,
          mimeType: media.attributes?.mimeType || 'image/png',
          altText: media.attributes?.altText,
        });
        if (!parentQ.attributes.mediaUrl) {
          parentQ.attributes.mediaUrl = rawUrl;
        }
      }
    }

    // 5. Resolve Passages to child questions
    for (const passage of passages) {
      const childQuestions = questions.filter((q) => {
        // Link if questions succeed passage in reading order / page
        return q.page === passage.page || (q.page && passage.page && q.page >= passage.page);
      });

      for (const q of childQuestions) {
        eog.addEdge({
          id: `edge_passage_${passage.id}_${q.id}`,
          sourceId: passage.id,
          targetId: q.id,
          relationship: 'references_passage',
          confidence: 0.85,
        });

        q.attributes.passage = {
          id: passage.id,
          title: passage.attributes?.title || 'Reading Context',
          text: passage.content,
        };
      }
    }

    console.log('[SemanticReconstructor] Finished semantic reconstruction successfully');
    return eog;
  }

  private static findNearestQuestion(
    node: EducationalNode,
    questions: EducationalNode[],
    allNodes: EducationalNode[]
  ): EducationalNode | undefined {
    if (!questions.length) return undefined;

    // First check explicit parentId match
    if (node.parentId) {
      const parent = questions.find((q) => q.id === node.parentId);
      if (parent) return parent;
    }

    // Prioritize questions whose stem explicitly references an image, diagram, or figure
    if (node.type === 'Image' || node.type === 'Diagram') {
      const explicitQ = questions.find((q) => {
        const stmtStr = (q.content || (q.attributes as any)?.statement || (q.attributes as any)?.text || (q as any).raw || '').toString().toLowerCase();
        return (
          stmtStr.includes('shown in the image') ||
          stmtStr.includes('identify the object') ||
          stmtStr.includes('match the image') ||
          stmtStr.includes('refer to the image') ||
          stmtStr.includes('in the image') ||
          stmtStr.includes('diagram') ||
          stmtStr.includes('figure')
        );
      });
      if (explicitQ) return explicitQ;
    }

    // Restrict to candidate questions on the same page as node
    const nodePage = node.page || (node.attributes as any)?.sourcePage;
    const samePageQuestions = nodePage ? questions.filter(q => q.page === nodePage || (q.attributes as any)?.sourcePage === nodePage) : questions;
    const candidateQuestions = samePageQuestions.length > 0 ? samePageQuestions : questions;

    const nodeIndex = allNodes.findIndex((n) => n.id === node.id);
    if (nodeIndex === -1) return candidateQuestions[0];

    // Search backwards and forwards for nearest question node
    let nearestQ: EducationalNode | undefined;
    let minDistance = Infinity;

    for (const q of candidateQuestions) {
      const qIndex = allNodes.findIndex((n) => n.id === q.id);
      if (qIndex !== -1) {
        const dist = Math.abs(qIndex - nodeIndex);
        if (dist < minDistance) {
          minDistance = dist;
          nearestQ = q;
        }
      }
    }

    return nearestQ || candidateQuestions[0];
  }

  private static detectLanguage(code: string): string {
    const text = code.toLowerCase();
    if (text.includes('select ') || text.includes('from ') || text.includes('where ')) return 'sql';
    if (text.includes('def ') || text.includes('import ') || text.includes('print(')) return 'python';
    if (text.includes('public class') || text.includes('system.out.println')) return 'java';
    if (text.includes('#include') || text.includes('std::cout')) return 'cpp';
    if (text.includes('<html') || text.includes('<div')) return 'html';
    return 'javascript';
  }
}
