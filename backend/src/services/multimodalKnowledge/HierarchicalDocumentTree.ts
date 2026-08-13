/**
 * Hierarchical Document Tree (AST)
 * Represents native document structure down to run-level formatting, hyperlinks, comments, tables, images, and math.
 */

export interface TextRunFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: number;
  hyperlinkUrl?: string;
  commentId?: string;
}

export interface TextRunNode {
  id: string;
  type: 'run';
  text: string;
  formatting: TextRunFormatting;
}

export interface ParagraphNode {
  id: string;
  type: 'paragraph' | 'heading';
  headingLevel?: number;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  runs: TextRunNode[];
  plainText: string;
  hyperlinkUrl?: string;
  commentId?: string;
}

export interface TableCellNode {
  rowIndex: number;
  colIndex: number;
  rowSpan?: number;
  colSpan?: number;
  paragraphs: ParagraphNode[];
  shadingColor?: string;
  isHeader?: boolean;
}

export interface TableNode {
  id: string;
  type: 'table';
  rowCount: number;
  columnCount: number;
  headers: string[];
  grid: TableCellNode[][];
  caption?: string;
}

export interface ImageNode {
  id: string;
  type: 'image';
  relationshipId?: string;
  mimeType?: string;
  url?: string;
  base64?: string;
  altText?: string;
  caption?: string;
}

export interface MathNode {
  id: string;
  type: 'math';
  latex: string;
  mathml?: string;
  rawXml?: string;
  isDisplayMode: boolean;
}

export interface CodeBlockNode {
  id: string;
  type: 'code';
  language: string;
  code: string;
  indentationPreserved: boolean;
}

export interface CommentNode {
  id: string;
  author: string;
  date?: string;
  text: string;
}

export interface SpeakerNoteNode {
  id: string;
  slideIndex: number;
  text: string;
  runs: TextRunNode[];
}

export type ASTNode = ParagraphNode | TableNode | ImageNode | MathNode | CodeBlockNode | CommentNode | SpeakerNoteNode;

export interface SectionNodeAST {
  id: string;
  title: string;
  level: number;
  children: ASTNode[];
}

export interface PageOrSlideAST {
  index: number;
  title?: string;
  type: 'page' | 'slide';
  children: ASTNode[];
  speakerNotes?: SpeakerNoteNode;
}

export class HierarchicalDocumentTree {
  public id: string;
  public title: string;
  public pages: PageOrSlideAST[];
  public sections: SectionNodeAST[];
  public comments: CommentNode[];
  public speakerNotes: SpeakerNoteNode[];
  public metadata: Record<string, any>;

  constructor(title: string) {
    this.id = `doc_tree_${Date.now()}`;
    this.title = title;
    this.pages = [];
    this.sections = [];
    this.comments = [];
    this.speakerNotes = [];
    this.metadata = {};
  }

  /**
   * Traverse all text runs in the document tree
   */
  public getAllRuns(): TextRunNode[] {
    const runs: TextRunNode[] = [];
    const visit = (nodes: ASTNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'paragraph' || node.type === 'heading') {
          runs.push(...node.runs);
        } else if (node.type === 'table') {
          node.grid.forEach(row => {
            row.forEach(cell => {
              cell.paragraphs.forEach(p => runs.push(...p.runs));
            });
          });
        }
      });
    };

    this.pages.forEach(p => visit(p.children));
    return runs;
  }

  /**
   * Traverse all paragraph nodes
   */
  public getAllParagraphs(): ParagraphNode[] {
    const paragraphs: ParagraphNode[] = [];
    const visit = (nodes: ASTNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'paragraph' || node.type === 'heading') {
          paragraphs.push(node);
        } else if (node.type === 'table') {
          node.grid.forEach(row => {
            row.forEach(cell => {
              paragraphs.push(...cell.paragraphs);
            });
          });
        }
      });
    };

    this.pages.forEach(p => visit(p.children));
    return paragraphs;
  }
}
