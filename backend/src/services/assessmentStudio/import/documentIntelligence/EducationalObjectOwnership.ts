/**
 * Educational Object Ownership Model
 * 
 * This module implements the core concept that educational objects belong to questions
 * exactly like a human teacher understands document structure.
 * 
 * Key Principles:
 * - Tables belong to their questions
 * - Formulas belong to their questions  
 * - Images belong to their questions
 * - Code blocks belong to their questions
 * - Paragraphs belong to the questions they explain
 * - Relationships are preserved and mapped
 * - Nothing is flattened or simplified
 */

import { BBox, ObjectType, DocumentObject } from './types.js';

export interface OwnershipBoundary {
  id: string;
  type: 'question' | 'section' | 'passage' | 'case_study';
  ownerId: string;
  bbox: BBox;
  page: number;
  confidence: number;
}

export interface OwnedObject {
  id: string;
  type: ObjectType;
  ownerId: string;
  ownershipType: 'primary' | 'secondary' | 'context' | 'reference';
  bbox: BBox;
  page: number;
  content?: string;
  relationships: Array<{
    targetId: string;
    relationship: string;
    confidence: number;
  }>;
  metadata: Record<string, any>;
}

export interface OwnershipGraph {
  boundaries: Map<string, OwnershipBoundary>;
  ownedObjects: Map<string, OwnedObject>;
  relationships: Map<string, Array<{ targetId: string; type: string; confidence: number }>>;
  metadata: {
    totalBoundaries: number;
    totalOwnedObjects: number;
    totalRelationships: number;
    ownershipCompleteness: number;
  };
}

export class EducationalObjectOwnership {
  private graph: OwnershipGraph;

  constructor() {
    this.graph = {
      boundaries: new Map(),
      ownedObjects: new Map(),
      relationships: new Map(),
      metadata: {
        totalBoundaries: 0,
        totalOwnedObjects: 0,
        totalRelationships: 0,
        ownershipCompleteness: 0,
      },
    };
  }

  /**
   * Create an ownership boundary for a question or section
   */
  createBoundary(boundary: OwnershipBoundary): void {
    this.graph.boundaries.set(boundary.id, boundary);
    this.graph.metadata.totalBoundaries++;
    this.calculateCompleteness();
  }

  /**
   * Assign an object to an owner with ownership type
   */
  assignObject(obj: OwnedObject): void {
    this.graph.ownedObjects.set(obj.id, obj);
    this.graph.relationships.set(obj.id, obj.relationships);
    this.graph.metadata.totalOwnedObjects++;
    this.graph.metadata.totalRelationships += obj.relationships.length;
    this.calculateCompleteness();
  }

  /**
   * Get all objects owned by a specific owner
   */
  getOwnedObjects(ownerId: string): OwnedObject[] {
    return Array.from(this.graph.ownedObjects.values()).filter(
      obj => obj.ownerId === ownerId
    );
  }

  /**
   * Get objects by ownership type
   */
  getObjectsByOwnershipType(ownerId: string, type: OwnedObject['ownershipType']): OwnedObject[] {
    return this.getOwnedObjects(ownerId).filter(obj => obj.ownershipType === type);
  }

  /**
   * Get primary components (tables, images, formulas, code) for a question
   */
  getPrimaryComponents(ownerId: string): {
    tables: OwnedObject[];
    images: OwnedObject[];
    formulas: OwnedObject[];
    codeBlocks: OwnedObject[];
  } {
    const objects = this.getObjectsByOwnershipType(ownerId, 'primary');
    
    return {
      tables: objects.filter(obj => obj.type === 'Table'),
      images: objects.filter(obj => obj.type === 'Image' || obj.type === 'Diagram'),
      formulas: objects.filter(obj => obj.type === 'Equation' || obj.type === 'Formula'),
      codeBlocks: objects.filter(obj => obj.type === 'CodeBlock' || obj.type === 'ProgrammingBlock'),
    };
  }

  /**
   * Get context objects (paragraphs, explanations) for a question
   */
  getContextObjects(ownerId: string): OwnedObject[] {
    return this.getObjectsByOwnershipType(ownerId, 'context');
  }

  /**
   * Get reference objects (footnotes, citations) for a question
   */
  getReferenceObjects(ownerId: string): OwnedObject[] {
    return this.getObjectsByOwnershipType(ownerId, 'reference');
  }

  /**
   * Build ownership relationships between objects
   */
  buildRelationships(): void {
    for (const [objId, obj] of this.graph.ownedObjects) {
      const boundary = this.graph.boundaries.get(obj.ownerId);
      if (!boundary) continue;

      // Spatial relationship
      const spatialRelationship = this.calculateSpatialRelationship(obj, boundary);
      if (spatialRelationship) {
        obj.relationships.push({
          targetId: boundary.id,
          relationship: 'spatially_contained',
          confidence: spatialRelationship.confidence,
        });
      }

      // Content relationship
      const contentRelationship = this.calculateContentRelationship(obj);
      if (contentRelationship) {
        obj.relationships.push(contentRelationship);
      }
    }
  }

  /**
   * Calculate spatial relationship between object and boundary
   */
  private calculateSpatialRelationship(obj: OwnedObject, boundary: OwnershipBoundary): { confidence: number } | null {
    const overlap = this.calculateBBoxOverlap(obj.bbox, boundary.bbox);
    
    if (overlap > 0.8) {
      return { confidence: 0.95 };
    } else if (overlap > 0.5) {
      return { confidence: 0.8 };
    } else if (overlap > 0.2) {
      return { confidence: 0.6 };
    }
    
    return null;
  }

  /**
   * Calculate overlap between two bounding boxes
   */
  private calculateBBoxOverlap(bbox1: BBox, bbox2: BBox): number {
    const xOverlap = Math.max(0, Math.min(bbox1.x + bbox1.width, bbox2.x + bbox2.width) - Math.max(bbox1.x, bbox2.x));
    const yOverlap = Math.max(0, Math.min(bbox1.y + bbox1.height, bbox2.y + bbox2.height) - Math.max(bbox1.y, bbox2.y));
    const overlapArea = xOverlap * yOverlap;
    const bbox1Area = bbox1.width * bbox1.height;
    const bbox2Area = bbox2.width * bbox2.height;
    const unionArea = bbox1Area + bbox2Area - overlapArea;
    
    return unionArea > 0 ? overlapArea / unionArea : 0;
  }

  /**
   * Calculate content relationship based on object type and content
   */
  private calculateContentRelationship(obj: OwnedObject): { targetId: string; relationship: string; confidence: number } | null {
    // This would be enhanced with NLP/semantic analysis
    // For now, use basic heuristics
    
    if (obj.type === 'Table' && obj.content) {
      return {
        targetId: obj.ownerId,
        relationship: 'provides_data_for',
        confidence: 0.85,
      };
    }
    
    if (obj.type === 'Image' || obj.type === 'Diagram') {
      return {
        targetId: obj.ownerId,
        relationship: 'illustrates',
        confidence: 0.9,
      };
    }
    
    if (obj.type === 'Equation' || obj.type === 'Formula') {
      return {
        targetId: obj.ownerId,
        relationship: 'mathematical_context_for',
        confidence: 0.95,
      };
    }
    
    if (obj.type === 'CodeBlock' || obj.type === 'ProgrammingBlock') {
      return {
        targetId: obj.ownerId,
        relationship: 'code_context_for',
        confidence: 0.9,
      };
    }
    
    return null;
  }

  /**
   * Calculate ownership completeness
   */
  private calculateCompleteness(): void {
    if (this.graph.metadata.totalBoundaries === 0) {
      this.graph.metadata.ownershipCompleteness = 0;
      return;
    }

    let totalAssigned = 0;
    for (const boundary of this.graph.boundaries.values()) {
      const owned = this.getOwnedObjects(boundary.id);
      totalAssigned += owned.length;
    }

    const expectedObjects = this.graph.metadata.totalBoundaries * 5; // Heuristic: expect ~5 objects per boundary
    this.graph.metadata.ownershipCompleteness = Math.min(1, totalAssigned / expectedObjects);
  }

  /**
   * Validate ownership model
   */
  validate(): {
    isValid: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for orphaned objects
    for (const obj of this.graph.ownedObjects.values()) {
      if (!this.graph.boundaries.has(obj.ownerId)) {
        issues.push(`Object ${obj.id} has orphaned owner ${obj.ownerId}`);
      }
    }

    // Check for empty boundaries
    for (const boundary of this.graph.boundaries.values()) {
      const owned = this.getOwnedObjects(boundary.id);
      if (owned.length === 0) {
        warnings.push(`Boundary ${boundary.id} has no owned objects`);
      }
    }

    // Check ownership completeness
    if (this.graph.metadata.ownershipCompleteness < 0.5) {
      warnings.push(`Low ownership completeness: ${this.graph.metadata.ownershipCompleteness}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Export ownership graph for Quiz Builder reconstruction
   */
  exportForQuizBuilder(): Record<string, any> {
    const exportData: Record<string, any> = {};

    for (const boundary of this.graph.boundaries.values()) {
      const owned = this.getOwnedObjects(boundary.id);
      const primary = this.getObjectsByOwnershipType(boundary.id, 'primary');
      const context = this.getObjectsByOwnershipType(boundary.id, 'context');
      const references = this.getObjectsByOwnershipType(boundary.id, 'reference');

      exportData[boundary.id] = {
        boundary: {
          id: boundary.id,
          type: boundary.type,
          bbox: boundary.bbox,
          page: boundary.page,
          confidence: boundary.confidence,
        },
        ownedObjects: {
          primary: primary.map(obj => this.serializeOwnedObject(obj)),
          context: context.map(obj => this.serializeOwnedObject(obj)),
          reference: references.map(obj => this.serializeOwnedObject(obj)),
        },
        allObjects: owned.map(obj => this.serializeOwnedObject(obj)),
        relationships: this.buildRelationshipExport(boundary.id),
      };
    }

    return exportData;
  }

  /**
   * Serialize owned object for export
   */
  private serializeOwnedObject(obj: OwnedObject): Record<string, any> {
    return {
      id: obj.id,
      type: obj.type,
      ownershipType: obj.ownershipType,
      bbox: obj.bbox,
      page: obj.page,
      content: obj.content,
      relationships: obj.relationships,
      metadata: obj.metadata,
    };
  }

  /**
   * Build relationship export for a boundary
   */
  private buildRelationshipExport(boundaryId: string): Array<{
    sourceId: string;
    targetId: string;
    type: string;
    confidence: number;
  }> {
    const relationships: Array<{
      sourceId: string;
      targetId: string;
      type: string;
      confidence: number;
    }> = [];

    const owned = this.getOwnedObjects(boundaryId);
    for (const obj of owned) {
      for (const rel of obj.relationships) {
        relationships.push({
          sourceId: obj.id,
          targetId: rel.targetId,
          type: rel.relationship,
          confidence: rel.confidence,
        });
      }
    }

    return relationships;
  }

  /**
   * Enforce strict question boundaries: Everything between Question X and Question X+1 belongs ONLY to Question X.
   */
  enforceStrictQuestionBoundaries(allNodes: DocumentObject[]): void {
    const questionBoundaries = Array.from(this.graph.boundaries.values())
      .filter(b => b.type === 'question')
      .sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        return a.bbox.y - b.bbox.y;
      });

    if (questionBoundaries.length === 0) return;

    for (let i = 0; i < questionBoundaries.length; i++) {
      const qCurrent = questionBoundaries[i];
      const qNext = i < questionBoundaries.length - 1 ? questionBoundaries[i + 1] : null;

      // Find all document objects between qCurrent and qNext
      const owned = allNodes.filter(node => {
        if (node.id === qCurrent.ownerId) return false;
        if (node.page < qCurrent.page) return false;
        if (qNext && node.page > qNext.page) return false;

        if (node.page === qCurrent.page && node.bbox.y < qCurrent.bbox.y) return false;
        if (qNext && node.page === qNext.page && node.bbox.y >= qNext.bbox.y) return false;

        return true;
      });

      for (const node of owned) {
        this.assignObject({
          id: node.id,
          type: node.type,
          ownerId: qCurrent.ownerId,
          ownershipType: node.type === 'Option' || node.type === 'CorrectAnswer' ? 'primary' : 'context',
          bbox: node.bbox,
          page: node.page,
          content: node.content,
          relationships: node.relationships.map(r => ({ targetId: r.targetId, relationship: r.type, confidence: r.confidence })),
          metadata: node.metadata,
        });
      }
    }
  }

  /**
   * Get ownership graph statistics
   */
  getStatistics(): Record<string, any> {
    const typeDistribution: Record<string, number> = {};
    const ownershipTypeDistribution: Record<string, number> = {};

    for (const obj of this.graph.ownedObjects.values()) {
      typeDistribution[obj.type] = (typeDistribution[obj.type] || 0) + 1;
      ownershipTypeDistribution[obj.ownershipType] = (ownershipTypeDistribution[obj.ownershipType] || 0) + 1;
    }

    return {
      boundaries: this.graph.metadata.totalBoundaries,
      ownedObjects: this.graph.metadata.totalOwnedObjects,
      relationships: this.graph.metadata.totalRelationships,
      ownershipCompleteness: this.graph.metadata.ownershipCompleteness,
      typeDistribution,
      ownershipTypeDistribution,
      validation: this.validate(),
    };
  }
}