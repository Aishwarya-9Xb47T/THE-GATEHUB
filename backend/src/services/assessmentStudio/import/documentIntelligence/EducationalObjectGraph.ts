/**
 * Educational Object Graph
 * Represents every document entity as a rich semantic educational node in a directed graph.
 */

import { ObjectType, RelationshipType, BBox } from './types.js';

export interface EducationalNode {
  id: string;
  type: ObjectType;
  content: string;
  bbox?: BBox;
  page?: number;
  confidence: number;
  parentId?: string;
  childrenIds: string[];
  attributes: Record<string, any>;
  metadata: {
    marks?: number;
    difficulty?: string;
    bloomLevel?: string;
    estimatedTimeSeconds?: number;
    rubric?: any;
    section?: string;
    subsection?: string;
    instruction?: string;
    [key: string]: any;
  };
}

export interface EducationalEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: RelationshipType;
  confidence: number;
  attributes?: Record<string, any>;
}

export class EducationalObjectGraph {
  public id: string;
  private nodes: Map<string, EducationalNode>;
  private edges: Map<string, EducationalEdge[]>;
  private rootId: string | null = null;

  constructor(id: string = `eog_${Date.now()}`) {
    this.id = id;
    this.nodes = new Map();
    this.edges = new Map();
  }

  public addNode(node: EducationalNode): void {
    if (!node.childrenIds) node.childrenIds = [];
    if (!node.attributes) node.attributes = {};
    if (!node.metadata) node.metadata = {};
    
    this.nodes.set(node.id, node);
    if (!this.edges.has(node.id)) {
      this.edges.set(node.id, []);
    }

    if (node.type === 'Document') {
      this.rootId = node.id;
    }
  }

  public getNode(id: string): EducationalNode | undefined {
    return this.nodes.get(id);
  }

  public getAllNodes(): EducationalNode[] {
    return Array.from(this.nodes.values());
  }

  public getNodesByType(type: ObjectType): EducationalNode[] {
    return this.getAllNodes().filter((n) => n.type === type);
  }

  public addEdge(edge: EducationalEdge): void {
    const list = this.edges.get(edge.sourceId) || [];
    list.push(edge);
    this.edges.set(edge.sourceId, list);

    // Also update parent/children references if relationship is parent/child
    if (edge.relationship === 'contains') {
      const parent = this.getNode(edge.sourceId);
      const child = this.getNode(edge.targetId);
      if (parent && child) {
        if (!parent.childrenIds.includes(child.id)) {
          parent.childrenIds.push(child.id);
        }
        child.parentId = parent.id;
      }
    }
  }

  public getEdgesFrom(sourceId: string): EducationalEdge[] {
    return this.edges.get(sourceId) || [];
  }

  public getTargetNodes(sourceId: string, relationship?: RelationshipType): EducationalNode[] {
    const edges = this.getEdgesFrom(sourceId);
    const filtered = relationship ? edges.filter((e) => e.relationship === relationship) : edges;
    return filtered
      .map((e) => this.getNode(e.targetId))
      .filter((n): n is EducationalNode => n !== undefined);
  }

  public getRoot(): EducationalNode | undefined {
    return this.rootId ? this.getNode(this.rootId) : undefined;
  }

  public toSerializable() {
    return {
      id: this.id,
      rootId: this.rootId,
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.entries()).map(([sourceId, edgeList]) => ({
        sourceId,
        edges: edgeList,
      })),
    };
  }
}
