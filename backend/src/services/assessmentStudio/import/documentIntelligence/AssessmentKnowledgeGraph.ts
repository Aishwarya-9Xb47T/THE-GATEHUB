/**
 * Assessment Knowledge Graph
 * Canonical knowledge graph representing educational nodes and explicit semantic relationships 
 * (belongs_to, references, illustrates, precedes, follows).
 */

export type AssessmentNodeType = 
  | 'Question'
  | 'Option'
  | 'Answer'
  | 'Formula'
  | 'Code'
  | 'Table'
  | 'Image'
  | 'Passage'
  | 'Explanation'
  | 'Hint'
  | 'Rubric';

export type AssessmentRelationship = 
  | 'belongs_to'
  | 'references'
  | 'illustrates'
  | 'precedes'
  | 'follows'
  | 'explains'
  | 'supports';

export interface KnowledgeNode {
  id: string;
  type: AssessmentNodeType;
  content: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: AssessmentRelationship;
  confidence: number;
}

export class AssessmentKnowledgeGraph {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private edges: KnowledgeEdge[] = [];

  addNode(node: KnowledgeNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: KnowledgeEdge): void {
    this.edges.push(edge);
  }

  getNode(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): KnowledgeNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): KnowledgeEdge[] {
    return this.edges;
  }
}
