import { ExtractedMedia, TextRunNode, TableNode, MathNode, CodeBlockNode } from '../types.js';

export type SemanticBlockType =
  | 'Heading'
  | 'Paragraph'
  | 'QuestionMarker'
  | 'QuestionText'
  | 'Answer'
  | 'Explanation'
  | 'Hint'
  | 'Table'
  | 'TableCaption'
  | 'Image'
  | 'ImageCaption'
  | 'Formula'
  | 'Equation'
  | 'CodeBlock'
  | 'Hyperlink'
  | 'OrderedList'
  | 'BulletList'
  | 'Checklist'
  | 'Diagram'
  | 'Flowchart'
  | 'Quote'
  | 'Metadata'
  | 'Footer'
  | 'Header'
  | 'PageBreak'
  | 'Option'
  | 'Caption'
  | 'List';

export interface SemanticBlock {
  id: string;
  type: SemanticBlockType;
  plainText: string;
  readingIndex?: number;
  runs?: TextRunNode[];
  headingLevel?: number;
  media?: ExtractedMedia;
  table?: TableNode;
  math?: MathNode;
  code?: CodeBlockNode;
  hyperlink?: { text: string; url: string; tooltip?: string };
  listData?: { style: 'ordered' | 'unordered' | 'checklist'; items: string[]; level?: number };
  optionPrefix?: string;
  isCorrectOption?: boolean;
  questionNumber?: number;
  parentId?: string;
  childrenIds?: string[];
  bbox?: { x: number; y: number; width: number; height: number; page: number };
}

export class SemanticDocumentTree {
  public title: string;
  public blocks: SemanticBlock[];
  public mediaList: ExtractedMedia[];

  constructor(title: string) {
    this.title = title;
    this.blocks = [];
    this.mediaList = [];
  }

  public addBlock(block: SemanticBlock) {
    this.blocks.push(block);
    if (block.media && !this.mediaList.some(m => m.id === block.media!.id)) {
      this.mediaList.push(block.media);
    }
  }
}
