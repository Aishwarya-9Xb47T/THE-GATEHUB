/**
 * Layout Expert Agent
 * Specializes in document layout analysis: pages, columns, rotation, reading order, tables, images
 */

import { BaseAgent } from './BaseAgent.js';
import { AgentInput, AgentOutput, DocumentObject, ObjectType, BBox } from '../types.js';

interface LayoutAnalysisResult {
  columns: number;
  orientation: 'portrait' | 'landscape';
  rotation: number;
  readingOrder: string[];
  tableRegions: Array<{ id: string; bbox: BBox; confidence: number }>;
  imageRegions: Array<{ id: string; bbox: BBox; confidence: number }>;
  confidence: number;
}

export class LayoutExpertAgent extends BaseAgent {
  constructor() {
    super({
      name: 'LayoutExpert',
      version: '1.0.0',
      capabilities: [
        'column_detection',
        'rotation_detection',
        'reading_order_determination',
        'table_detection',
        'image_detection',
        'layout_analysis',
      ],
      maxRetries: 3,
      timeout: 30000,
    });
  }

  /**
   * Process layout analysis
   */
  protected async process(input: AgentInput): Promise<LayoutAnalysisResult> {
    this.log('Starting layout analysis');

    const nodes = this.documentGraph.nodes;
    const allNodes = Array.from(nodes.values());

    // Detect columns
    const columns = this.detectColumns(allNodes);
    this.log(`Detected ${columns} columns`);

    // Detect orientation
    const orientation = this.detectOrientation(allNodes);
    this.log(`Detected orientation: ${orientation}`);

    // Detect rotation
    const rotation = this.detectRotation(allNodes);
    this.log(`Detected rotation: ${rotation} degrees`);

    // Determine reading order
    const readingOrder = this.determineReadingOrder(allNodes, columns);
    this.log(`Determined reading order for ${readingOrder.length} regions`);

    // Detect table regions
    const tableRegions = this.detectTableRegions(allNodes);
    this.log(`Detected ${tableRegions.length} table regions`);

    // Detect image regions
    const imageRegions = this.detectImageRegions(allNodes);
    this.log(`Detected ${imageRegions.length} image regions`);

    // Calculate overall confidence
    const confidence = this.calculateConfidence({
      columns,
      orientation,
      rotation,
      readingOrder,
      tableRegions,
      imageRegions,
      confidence: 0,
    });

    // Update document graph with layout information
    this.updateGraphWithLayoutInfo({
      columns,
      orientation,
      rotation,
      readingOrder,
      tableRegions,
      imageRegions,
      confidence,
    });

    return {
      columns,
      orientation,
      rotation,
      readingOrder,
      tableRegions,
      imageRegions,
      confidence,
    };
  }

  /**
   * Calculate confidence for layout analysis
   */
  protected calculateConfidence(result: LayoutAnalysisResult): number {
    const columnConfidence = result.columns > 0 ? 0.9 : 0.5;
    const orientationConfidence = 0.95;
    const rotationConfidence = result.rotation === 0 ? 0.95 : 0.8;
    const readingOrderConfidence = result.readingOrder.length > 0 ? 0.85 : 0.5;
    const tableConfidence = result.tableRegions.length > 0 ? 0.8 : 0.9;
    const imageConfidence = result.imageRegions.length > 0 ? 0.85 : 0.9;

    return (
      columnConfidence * 0.2 +
      orientationConfidence * 0.15 +
      rotationConfidence * 0.1 +
      readingOrderConfidence * 0.25 +
      tableConfidence * 0.15 +
      imageConfidence * 0.15
    );
  }

  /**
   * Detect number of columns
   */
  private detectColumns(nodes: DocumentObject[]): number {
    if (nodes.length === 0) return 1;

    // Group nodes by page
    const nodesByPage = new Map<number, DocumentObject[]>();
    for (const node of nodes) {
      const page = node.page;
      if (!nodesByPage.has(page)) {
        nodesByPage.set(page, []);
      }
      nodesByPage.get(page)!.push(node);
    }

    // Analyze each page
    const columnCounts: number[] = [];
    for (const [page, pageNodes] of nodesByPage.entries()) {
      const pageColumns = this.detectColumnsForPage(pageNodes);
      columnCounts.push(pageColumns);
    }

    // Return most common column count
    const columnFrequency = new Map<number, number>();
    for (const count of columnCounts) {
      columnFrequency.set(count, (columnFrequency.get(count) || 0) + 1);
    }

    let maxCount = 0;
    let mostCommonColumns = 1;
    for (const [columns, frequency] of columnFrequency.entries()) {
      if (frequency > maxCount) {
        maxCount = frequency;
        mostCommonColumns = columns;
      }
    }

    return mostCommonColumns;
  }

  /**
   * Detect columns for a single page
   */
  private detectColumnsForPage(nodes: DocumentObject[]): number {
    if (nodes.length < 5) return 1;

    // Analyze x-coordinate distribution
    const xPositions = nodes.map(n => n.bbox.x);
    const minX = Math.min(...xPositions);
    const maxX = Math.max(...xPositions);
    const range = maxX - minX;

    // If range is small, likely single column
    if (range < 100) return 1;

    // Look for gaps in x-positions that suggest column boundaries
    const sortedX = [...xPositions].sort((a, b) => a - b);
    const gaps: number[] = [];

    for (let i = 1; i < sortedX.length; i++) {
      gaps.push(sortedX[i] - sortedX[i - 1]);
    }

    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const largeGaps = gaps.filter(gap => gap > avgGap * 2).length;

    // Each large gap suggests a column boundary
    return Math.min(largeGaps + 1, 3); // Max 3 columns
  }

  /**
   * Detect document orientation
   */
  private detectOrientation(nodes: DocumentObject[]): 'portrait' | 'landscape' {
    if (nodes.length === 0) return 'portrait';

    // Calculate average width and height of nodes
    const widths = nodes.map(n => n.bbox.width);
    const heights = nodes.map(n => n.bbox.height);

    const avgWidth = widths.reduce((sum, w) => sum + w, 0) / widths.length;
    const avgHeight = heights.reduce((sum, h) => sum + h, 0) / heights.length;

    // If width > height, landscape
    return avgWidth > avgHeight ? 'landscape' : 'portrait';
  }

  /**
   * Detect document rotation
   */
  private detectRotation(nodes: DocumentObject[]): number {
    // Simple heuristic - in production would use vision AI
    // Check if text is mostly horizontal or vertical
    const widths = nodes.map(n => n.bbox.width);
    const heights = nodes.map(n => n.bbox.height);

    const avgWidth = widths.reduce((sum, w) => sum + w, 0) / widths.length;
    const avgHeight = heights.reduce((sum, h) => sum + h, 0) / heights.length;

    // If height >> width, might be rotated 90 degrees
    if (avgHeight > avgWidth * 2) {
      return 90;
    }

    return 0;
  }

  /**
   * Determine reading order
   */
  private determineReadingOrder(nodes: DocumentObject[], columns: number): string[] {
    // Group by page
    const nodesByPage = new Map<number, DocumentObject[]>();
    for (const node of nodes) {
      const page = node.page;
      if (!nodesByPage.has(page)) {
        nodesByPage.set(page, []);
      }
      nodesByPage.get(page)!.push(node);
    }

    const readingOrder: string[] = [];

    // Process each page
    for (const [page, pageNodes] of Array.from(nodesByPage.entries()).sort((a, b) => a[0] - b[0])) {
      const pageOrder = this.determineReadingOrderForPage(pageNodes, columns);
      readingOrder.push(...pageOrder);
    }

    return readingOrder;
  }

  /**
   * Determine reading order for a single page
   */
  private determineReadingOrderForPage(nodes: DocumentObject[], columns: number): string[] {
    if (columns === 1) {
      // Single column: sort by y-coordinate
      return nodes
        .sort((a, b) => a.bbox.y - b.bbox.y)
        .map(n => n.id);
    }

    // Multiple columns: sort by column, then by y
    const columnWidth = 800 / columns; // Assume 800px width
    const columnGroups: DocumentObject[][] = Array.from({ length: columns }, () => []);

    for (const node of nodes) {
      const column = Math.min(Math.floor(node.bbox.x / columnWidth), columns - 1);
      columnGroups[column].push(node);
    }

    // Sort each column by y
    for (const group of columnGroups) {
      group.sort((a, b) => a.bbox.y - b.bbox.y);
    }

    // Interleave columns (read top line across all columns, then next line)
    const readingOrder: string[] = [];
    const maxRows = Math.max(...columnGroups.map(g => g.length));

    for (let row = 0; row < maxRows; row++) {
      for (let col = 0; col < columns; col++) {
        if (columnGroups[col][row]) {
          readingOrder.push(columnGroups[col][row].id);
        }
      }
    }

    return readingOrder;
  }

  /**
   * Detect table regions
   */
  private detectTableRegions(nodes: DocumentObject[]): Array<{ id: string; bbox: BBox; confidence: number }> {
    const tableNodes = nodes.filter(n => n.type === 'Table');

    return tableNodes.map(node => ({
      id: node.id,
      bbox: node.bbox,
      confidence: node.confidence,
    }));
  }

  /**
   * Detect image regions
   */
  private detectImageRegions(nodes: DocumentObject[]): Array<{ id: string; bbox: BBox; confidence: number }> {
    const imageNodes = nodes.filter(n => n.type === 'Image' || n.type === 'Diagram');

    return imageNodes.map(node => ({
      id: node.id,
      bbox: node.bbox,
      confidence: node.confidence,
    }));
  }

  /**
   * Update document graph with layout information
   */
  private updateGraphWithLayoutInfo(result: LayoutAnalysisResult): void {
    // Update root node metadata with layout information
    const rootId = this.documentGraph.root?.id;
    if (rootId) {
      const root = this.documentGraph.nodes.get(rootId);
      if (root) {
        root.metadata = {
          ...root.metadata,
          layout: {
            columns: result.columns,
            orientation: result.orientation,
            rotation: result.rotation,
            readingOrder: result.readingOrder,
          },
          tableRegions: result.tableRegions,
          imageRegions: result.imageRegions,
        };
      }
    }

    this.log('Updated document graph with layout information');
  }
}

// Helper for column groups
function columnGroups<T>(count: number): T[][] {
  return Array.from({ length: count }, () => []);
}
