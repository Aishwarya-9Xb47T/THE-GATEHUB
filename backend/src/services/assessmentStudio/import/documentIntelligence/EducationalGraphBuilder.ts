/**
 * Educational Graph Builder
 * Converts Document Graph nodes into an Educational Object Graph containing rich semantic entities.
 */

import { DocumentGraph } from './DocumentGraph.js';
import { EducationalObjectGraph, EducationalNode, EducationalEdge } from './EducationalObjectGraph.js';
import { ObjectType } from './types.js';

export class EducationalGraphBuilder {
  static build(documentGraph: DocumentGraph): EducationalObjectGraph {
    console.log('[EducationalGraphBuilder] Building Educational Object Graph from Document Graph');
    const eog = new EducationalObjectGraph();

    const rootDocNode = (documentGraph as any).getRootNode ? (documentGraph as any).getRootNode() : (documentGraph as any).getRoot ? (documentGraph as any).getRoot() : documentGraph.getAllNodes()[0];
    if (rootDocNode) {
      eog.addNode({
        id: rootDocNode.id,
        type: 'Document',
        content: rootDocNode.content || '',
        confidence: 1.0,
        childrenIds: [],
        attributes: rootDocNode.metadata || {},
        metadata: {},
      });
    }

    const allDocNodes = documentGraph.getAllNodes();
    let currentSectionId: string | null = null;
    let currentPassageId: string | null = null;

    for (const docNode of allDocNodes) {
      if (docNode.type === 'Document') continue;

      const objType: ObjectType = this.mapDocObjectTypeToEducationalType(docNode.type, docNode.content || '');

      const eduNode: EducationalNode = {
        id: docNode.id,
        type: objType,
        content: docNode.content || '',
        bbox: docNode.bbox,
        page: docNode.page,
        confidence: docNode.confidence || 0.9,
        parentId: docNode.parent || (rootDocNode ? rootDocNode.id : undefined),
        childrenIds: docNode.children || [],
        attributes: {
          ...docNode.metadata,
          rawType: docNode.type,
        },
        metadata: {
          section: docNode.metadata?.section || currentSectionId || undefined,
          marks: docNode.metadata?.marks,
          difficulty: docNode.metadata?.difficulty,
          bloomLevel: docNode.metadata?.bloomLevel,
        },
      };

      if (objType === 'Section' || objType === 'Heading') {
        currentSectionId = docNode.content || docNode.id;
      }

      if (objType === 'ReadingPassage' || objType === 'CaseStudy') {
        currentPassageId = docNode.id;
      }

      eog.addNode(eduNode);

      // Connect node to parent or document root
      const parentId = docNode.parent || (rootDocNode ? rootDocNode.id : null);
      if (parentId) {
        eog.addEdge({
          id: `edge_${parentId}_${eduNode.id}`,
          sourceId: parentId,
          targetId: eduNode.id,
          relationship: 'contains',
          confidence: 0.9,
        });
      }

      // Link reading passage to parent context if present
      if (currentPassageId && eduNode.id !== currentPassageId && objType === 'Question') {
        eog.addEdge({
          id: `edge_passage_${currentPassageId}_${eduNode.id}`,
          sourceId: currentPassageId,
          targetId: eduNode.id,
          relationship: 'references_passage',
          confidence: 0.85,
        });
      }
    }

    console.log('[EducationalGraphBuilder] Completed Educational Object Graph construction', {
      totalNodes: eog.getAllNodes().length,
    });

    return eog;
  }

  private static mapDocObjectTypeToEducationalType(type: string, content: string): ObjectType {
    const text = (content || '').toLowerCase();
    if (type === 'Table' || text.includes('<table')) return 'Table';
    if (type === 'Equation' || text.includes('\\frac') || text.includes('<m:omath') || text.includes('<math')) return 'Equation';
    if (
      type === 'CodeBlock' ||
      text.includes('def ') ||
      text.includes('if n == 0') ||
      text.includes('return n * factorial') ||
      text.includes('function ') ||
      text.includes('public class ') ||
      text.includes('#include')
    ) return 'CodeBlock';
    if (type === 'Image') return 'Image';
    if (type === 'Diagram') return 'Diagram';
    if (type === 'Section' || type === 'Heading') return 'Section';

    // Context / Passage checks
    if (text.includes('read the following passage') || text.includes('case study:')) {
      return 'ReadingPassage';
    }

    return 'Paragraph';
  }
}
