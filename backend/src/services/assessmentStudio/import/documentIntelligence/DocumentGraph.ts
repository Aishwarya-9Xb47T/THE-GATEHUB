/**
 * Document Graph - Core graph data structure for Document Intelligence Engine
 * Represents document as a graph of objects with relationships
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DocumentObject,
  Relationship,
  RelationshipType,
  DocumentGraph as DocumentGraphType,
  ObjectType,
  BBox,
} from './types.js';

export class DocumentGraph {
  private nodes: Map<string, DocumentObject>;
  private edges: Map<string, Relationship[]>;
  private rootId: string | null;
  private metadata: {
    totalPages: number;
    totalNodes: number;
    totalEdges: number;
    createdAt: Date;
  };

  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.rootId = null;
    this.metadata = {
      totalPages: 0,
      totalNodes: 0,
      totalEdges: 0,
      createdAt: new Date(),
    };
  }

  /**
   * Create a new document object
   */
  static createObject(
    type: ObjectType,
    bbox: BBox,
    content?: string,
    metadata?: Record<string, any>,
    style?: any,
    readingOrder: number = 0
  ): DocumentObject {
    return {
      id: uuidv4(),
      type,
      bbox,
      page: bbox.page,
      confidence: 1.0,
      readingOrder,
      children: [],
      parent: undefined,
      relationships: [],
      style,
      metadata: metadata || {},
      content,
    };
  }

  /**
   * Add a node to the graph
   */
  addNode(node: DocumentObject): void {
    this.nodes.set(node.id, node);
    this.metadata.totalNodes++;

    // Set as root if first node
    if (!this.rootId) {
      this.rootId = node.id;
    }

    // Update total pages
    this.metadata.totalPages = Math.max(this.metadata.totalPages, node.page);
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): DocumentObject | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): DocumentObject[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get nodes by type
   */
  getNodesByType(type: ObjectType): DocumentObject[] {
    return Array.from(this.nodes.values()).filter(node => node.type === type);
  }

  /**
   * Get nodes on a specific page
   */
  getNodesByPage(page: number): DocumentObject[] {
    return Array.from(this.nodes.values()).filter(node => node.page === page);
  }

  /**
   * Add a relationship (edge) between two nodes
   */
  addRelationship(
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    confidence: number = 1.0,
    metadata?: Record<string, any>
  ): void {
    const sourceNode = this.nodes.get(sourceId);
    const targetNode = this.nodes.get(targetId);

    if (!sourceNode || !targetNode) {
      throw new Error(`Cannot add relationship: node not found`);
    }

    const relationship: Relationship = {
      type,
      targetId,
      confidence,
      metadata,
    };

    // Add to source node's relationships
    sourceNode.relationships.push(relationship);

    // Add to edges map
    if (!this.edges.has(sourceId)) {
      this.edges.set(sourceId, []);
    }
    this.edges.get(sourceId)!.push(relationship);

    // Update parent-child if relationship is 'contains'
    if (type === 'contains') {
      sourceNode.children.push(targetId);
      targetNode.parent = sourceId;
    }

    this.metadata.totalEdges++;
  }

  /**
   * Get relationships for a node
   */
  getRelationships(nodeId: string): Relationship[] {
    return this.edges.get(nodeId) || [];
  }

  /**
   * Get relationships by type
   */
  getRelationshipsByType(nodeId: string, type: RelationshipType): Relationship[] {
    const relationships = this.edges.get(nodeId) || [];
    return relationships.filter(rel => rel.type === type);
  }

  /**
   * Get children of a node
   */
  getChildren(nodeId: string): DocumentObject[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    return node.children
      .map(childId => this.nodes.get(childId))
      .filter((child): child is DocumentObject => child !== undefined);
  }

  /**
   * Get parent of a node
   */
  getParent(nodeId: string): DocumentObject | undefined {
    const node = this.nodes.get(nodeId);
    if (!node || !node.parent) return undefined;

    return this.nodes.get(node.parent);
  }

  /**
   * Get ancestors of a node (all parents up to root)
   */
  getAncestors(nodeId: string): DocumentObject[] {
    const ancestors: DocumentObject[] = [];
    let currentId = nodeId;

    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node || !node.parent) break;

      const parent = this.nodes.get(node.parent);
      if (parent) {
        ancestors.push(parent);
        currentId = parent.id;
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Get descendants of a node (all children recursively)
   */
  getDescendants(nodeId: string): DocumentObject[] {
    const descendants: DocumentObject[] = [];
    const children = this.getChildren(nodeId);

    for (const child of children) {
      descendants.push(child);
      descendants.push(...this.getDescendants(child.id));
    }

    return descendants;
  }

  /**
   * Get siblings of a node (same parent)
   */
  getSiblings(nodeId: string): DocumentObject[] {
    const node = this.nodes.get(nodeId);
    if (!node || !node.parent) return [];

    const parent = this.nodes.get(node.parent);
    if (!parent) return [];

    return parent.children
      .map(childId => this.nodes.get(childId))
      .filter((child): child is DocumentObject => child !== undefined && child.id !== nodeId);
  }

  /**
   * Find nodes by spatial proximity
   */
  findNearbyNodes(
    bbox: BBox,
    maxDistance: number = 100,
    samePage: boolean = true
  ): DocumentObject[] {
    return Array.from(this.nodes.values()).filter(node => {
      if (samePage && node.page !== bbox.page) return false;

      const distance = this.calculateDistance(bbox, node.bbox);
      return distance <= maxDistance;
    });
  }

  /**
   * Calculate distance between two bounding boxes
   */
  private calculateDistance(bbox1: BBox, bbox2: BBox): number {
    if (bbox1.page !== bbox2.page) return Infinity;

    const center1 = { x: bbox1.x + bbox1.width / 2, y: bbox1.y + bbox1.height / 2 };
    const center2 = { x: bbox2.x + bbox2.width / 2, y: bbox2.y + bbox2.height / 2 };

    return Math.sqrt(Math.pow(center2.x - center1.x, 2) + Math.pow(center2.y - center1.y, 2));
  }

  /**
   * Check if bbox1 contains bbox2
   */
  contains(bbox1: BBox, bbox2: BBox): boolean {
    if (bbox1.page !== bbox2.page) return false;

    return (
      bbox2.x >= bbox1.x &&
      bbox2.y >= bbox1.y &&
      bbox2.x + bbox2.width <= bbox1.x + bbox1.width &&
      bbox2.y + bbox2.height <= bbox1.y + bbox1.height
    );
  }

  /**
   * Check if bbox1 overlaps bbox2
   */
  overlaps(bbox1: BBox, bbox2: BBox): boolean {
    if (bbox1.page !== bbox2.page) return false;

    return !(
      bbox1.x + bbox1.width < bbox2.x ||
      bbox2.x + bbox2.width < bbox1.x ||
      bbox1.y + bbox1.height < bbox2.y ||
      bbox2.y + bbox2.height < bbox1.y
    );
  }

  /**
   * Remove a node from the graph
   */
  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove from parent's children
    if (node.parent) {
      const parent = this.nodes.get(node.parent);
      if (parent) {
        parent.children = parent.children.filter(id => id !== nodeId);
      }
    }

    // Remove children's parent reference
    for (const childId of node.children) {
      const child = this.nodes.get(childId);
      if (child) {
        child.parent = undefined;
      }
    }

    // Remove relationships
    this.edges.delete(nodeId);

    // Remove relationships pointing to this node
    for (const [sourceId, relationships] of this.edges.entries()) {
      this.edges.set(
        sourceId,
        relationships.filter(rel => rel.targetId !== nodeId)
      );
    }

    // Remove node
    this.nodes.delete(nodeId);
    this.metadata.totalNodes--;

    // Update root if needed
    if (this.rootId === nodeId) {
      this.rootId = null;
    }
  }

  /**
   * Validate the graph
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check root exists
    if (!this.rootId) {
      errors.push('Graph has no root node');
    }

    // Check all parent references are valid
    for (const [id, node] of this.nodes.entries()) {
      if (node.parent && !this.nodes.has(node.parent)) {
        errors.push(`Node ${id} has invalid parent reference: ${node.parent}`);
      }

      // Check all children exist
      for (const childId of node.children) {
        if (!this.nodes.has(childId)) {
          errors.push(`Node ${id} has invalid child reference: ${childId}`);
        }
      }

      // Check all relationship targets exist
      for (const rel of node.relationships) {
        if (!this.nodes.has(rel.targetId)) {
          errors.push(`Node ${id} has relationship to non-existent node: ${rel.targetId}`);
        }
      }
    }

    // Check for cycles in parent-child relationships
    const visited = new Set<string>();
    const hasCycle = this.detectCycle(this.rootId || '', visited);
    if (hasCycle) {
      errors.push('Graph contains cycles in parent-child relationships');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Detect cycles in parent-child relationships
   */
  private detectCycle(nodeId: string, visited: Set<string>): boolean {
    if (visited.has(nodeId)) return true;

    const node = this.nodes.get(nodeId);
    if (!node) return false;

    visited.add(nodeId);

    for (const childId of node.children) {
      if (this.detectCycle(childId, visited)) {
        return true;
      }
    }

    visited.delete(nodeId);
    return false;
  }

  /**
   * Convert to serializable format
   */
  toSerializable(): DocumentGraphType {
    return {
      id: this.rootId || '',
      root: this.rootId ? this.nodes.get(this.rootId)! : this.createEmptyRoot(),
      nodes: this.nodes,
      edges: this.edges,
      metadata: this.metadata,
    };
  }

  /**
   * Create empty root node for serialization
   */
  private createEmptyRoot(): DocumentObject {
    return {
      id: '',
      type: 'Document',
      bbox: { x: 0, y: 0, width: 0, height: 0, page: 0 },
      page: 0,
      confidence: 0,
      readingOrder: 0,
      children: [],
      relationships: [],
      metadata: {},
    };
  }

  /**
   * Get graph statistics
   */
  getStatistics(): {
    totalNodes: number;
    totalEdges: number;
    totalPages: number;
    nodesByType: Record<ObjectType, number>;
    relationshipsByType: Record<RelationshipType, number>;
  } {
    const nodesByType: Record<ObjectType, number> = {} as any;
    const relationshipsByType: Record<RelationshipType, number> = {} as any;

    // Count nodes by type
    for (const node of this.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    // Count relationships by type
    for (const relationships of this.edges.values()) {
      for (const rel of relationships) {
        relationshipsByType[rel.type] = (relationshipsByType[rel.type] || 0) + 1;
      }
    }

    return {
      totalNodes: this.nodes.size,
      totalEdges: this.metadata.totalEdges,
      totalPages: this.metadata.totalPages,
      nodesByType,
      relationshipsByType,
    };
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.rootId = null;
    this.metadata = {
      totalPages: 0,
      totalNodes: 0,
      totalEdges: 0,
      createdAt: new Date(),
    };
  }

  /**
   * Clone the graph
   */
  clone(): DocumentGraph {
    const cloned = new DocumentGraph();

    // Clone all nodes
    for (const [id, node] of this.nodes.entries()) {
      cloned.addNode({
        ...node,
        id, // Keep same ID
        children: [...node.children],
        relationships: [...node.relationships],
      });
    }

    // Clone all edges
    for (const [sourceId, relationships] of this.edges.entries()) {
      for (const rel of relationships) {
        cloned.addRelationship(
          sourceId,
          rel.targetId,
          rel.type,
          rel.confidence,
          rel.metadata
        );
      }
    }

    // Set root
    cloned.rootId = this.rootId;

    return cloned;
  }
}
