/**
 * Layout Engine for Presentation Import
 * 
 * Automatically adjusts imported layouts to prevent:
 * - Text clipping
 * - Overlapping elements
 * - Cropped tables
 * - Content outside slide boundaries
 */

export interface ElementBounds {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface Collision {
  element1: string;
  element2: string;
  overlapArea: number;
}

/**
 * Measure actual rendered size of an element
 */
export function measureElement(element: HTMLElement): ElementBounds {
  const rect = element.getBoundingClientRect();
  const scrollWidth = element.scrollWidth;
  const scrollHeight = element.scrollHeight;
  
  return {
    id: element.id || `element-${Math.random().toString(36).substr(2, 9)}`,
    left: rect.left,
    top: rect.top,
    width: Math.max(rect.width, scrollWidth),
    height: Math.max(rect.height, scrollHeight),
    right: rect.left + Math.max(rect.width, scrollWidth),
    bottom: rect.top + Math.max(rect.height, scrollHeight),
  };
}

/**
 * Check if two bounds overlap
 */
export function boundsOverlap(a: ElementBounds, b: ElementBounds): boolean {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

/**
 * Calculate overlap area between two bounds
 */
export function calculateOverlapArea(a: ElementBounds, b: ElementBounds): number {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return xOverlap * yOverlap;
}

/**
 * Detect all collisions between elements
 */
export function detectCollisions(elements: ElementBounds[]): Collision[] {
  const collisions: Collision[] = [];
  
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];
      
      if (boundsOverlap(a, b)) {
        collisions.push({
          element1: a.id,
          element2: b.id,
          overlapArea: calculateOverlapArea(a, b),
        });
      }
    }
  }
  
  return collisions;
}

/**
 * Resolve collision by moving element downward
 */
export function resolveCollisionByMovingDown(
  element: ElementBounds,
  obstacle: ElementBounds
): ElementBounds {
  const verticalGap = 8; // Small gap between elements
  const newTop = obstacle.bottom + verticalGap;
  
  return {
    ...element,
    top: newTop,
    bottom: newTop + element.height,
  };
}

/**
 * Auto-expand element to fit content
 */
export function autoExpandElement(
  element: HTMLElement,
  importedWidth: number,
  importedHeight: number
): { width: number; height: number } {
  const scrollWidth = element.scrollWidth;
  const scrollHeight = element.scrollHeight;
  
  // Expand if content overflows
  const newWidth = Math.max(importedWidth, scrollWidth);
  const newHeight = Math.max(importedHeight, scrollHeight);
  
  return { width: newWidth, height: newHeight };
}

/**
 * Auto-size table columns based on content
 */
export function autoSizeTableColumns(tableElement: HTMLTableElement): number[] {
  const rows = tableElement.querySelectorAll('tr');
  const columnCount = rows[0]?.querySelectorAll('td, th').length || 0;
  const columnWidths: number[] = new Array(columnCount).fill(0);
  
  // Measure each cell's required width
  rows.forEach(row => {
    const cells = row.querySelectorAll('td, th');
    cells.forEach((cell, colIndex) => {
      if (colIndex < columnCount) {
        const scrollWidth = cell.scrollWidth;
        columnWidths[colIndex] = Math.max(columnWidths[colIndex], scrollWidth);
      }
    });
  });
  
  return columnWidths;
}

/**
 * Apply auto-sized column widths to table
 */
export function applyColumnWidths(tableElement: HTMLTableElement, columnWidths: number[]): void {
  const colgroup = tableElement.querySelector('colgroup');
  if (!colgroup) return;
  
  const cols = colgroup.querySelectorAll('col');
  cols.forEach((col, index) => {
    if (index < columnWidths.length) {
      col.style.width = `${columnWidths[index]}px`;
    }
  });
}

/**
 * Main layout adjustment pipeline
 */
export interface LayoutAdjustmentOptions {
  container: HTMLElement;
  slideWidth: number;
  slideHeight: number;
  onElementResize?: (id: string, width: number, height: number) => void;
  onElementMove?: (id: string, top: number, left: number) => void;
}

export function adjustLayout(options: LayoutAdjustmentOptions): void {
  const { container, slideWidth, slideHeight, onElementResize, onElementMove } = options;
  
  // Step 1: Measure all elements
  const elements = Array.from(container.children).filter(
    child => child instanceof HTMLElement && child.id
  ) as HTMLElement[];
  
  const bounds = elements.map(el => measureElement(el));
  
  // Step 2: Auto-expand elements that overflow
  bounds.forEach((bound, index) => {
    const element = elements[index];
    const { width, height } = autoExpandElement(element, bound.width, bound.height);
    
    if (width !== bound.width || height !== bound.height) {
      if (onElementResize) {
        onElementResize(bound.id, width, height);
      }
    }
  });
  
  // Step 3: Detect collisions
  const collisions = detectCollisions(bounds);
  
  // Step 4: Resolve collisions by moving elements downward
  const adjustedBounds = [...bounds];
  let hasCollision = true;
  let iterations = 0;
  const maxIterations = 100;
  
  while (hasCollision && iterations < maxIterations) {
    hasCollision = false;
    iterations++;
    
    const currentCollisions = detectCollisions(adjustedBounds);
    
    currentCollisions.forEach(collision => {
      const idx1 = adjustedBounds.findIndex(b => b.id === collision.element1);
      const idx2 = adjustedBounds.findIndex(b => b.id === collision.element2);
      
      if (idx1 === -1 || idx2 === -1) return;
      
      const el1 = adjustedBounds[idx1];
      const el2 = adjustedBounds[idx2];
      
      // Move the lower element downward
      if (el1.top < el2.top) {
        adjustedBounds[idx2] = resolveCollisionByMovingDown(el2, el1);
        if (onElementMove) {
          onElementMove(el2.id, adjustedBounds[idx2].top, el2.left);
        }
      } else {
        adjustedBounds[idx1] = resolveCollisionByMovingDown(el1, el2);
        if (onElementMove) {
          onElementMove(el1.id, adjustedBounds[idx1].top, el1.left);
        }
      }
      
      hasCollision = true;
    });
  }
  
  // Step 5: Check slide boundary
  const maxRight = Math.max(...adjustedBounds.map(b => b.right));
  const maxBottom = Math.max(...adjustedBounds.map(b => b.bottom));
  
  if (maxRight > slideWidth || maxBottom > slideHeight) {
    // Elements extend outside slide - could expand slide or reduce scale
    // For now, we'll log this for debugging
    console.warn('Elements extend outside slide boundary:', { maxRight, maxBottom, slideWidth, slideHeight });
  }
}
