import JSZip from 'jszip';
import { SemanticDocumentTree, SemanticBlock } from '../pass1/SemanticDocumentTree.js';
import { EducationalGroupingEngine } from '../pass2/EducationalGroupingEngine.js';
import { UnifiedExtractionResult, ExtractedMedia, TextRunNode } from '../types.js';
import { TableExtractor } from '../extractors/TableExtractor.js';
import { MathFormulaEngine } from '../extractors/MathFormulaEngine.js';
import { CodeBlockExtractor } from '../extractors/CodeBlockExtractor.js';

export class DocxOpenXmlParser {
  /**
   * Parse OpenXML DOCX using the Two-Pass Educational Document Understanding Architecture
   * Pass 1: Build SemanticDocumentTree (blocks, images, equations, code, tables, formatting)
   * Pass 2: EducationalGroupingEngine (build Question Root Containers)
   */
  public static async parse(
    buffer: Buffer,
    fileName: string
  ): Promise<UnifiedExtractionResult> {
    const zip = await JSZip.loadAsync(buffer);

    // 1. Resolve relationships from word/_rels/document.xml.rels
    const relsMap = await this.parseRelationships(zip);

    // 2. Extract ALL images from word/media/
    const mediaMap = await this.extractMediaMapFromZip(zip, relsMap);

    // 3. Extract Footnotes, Endnotes, Comments, Headers, Footers
    const footnotes = await this.parseFootnotes(zip);
    const endnotes = await this.parseEndnotes(zip);
    const comments = await this.parseComments(zip);
    const headers = await this.parseHeaderFooters(zip, 'header');
    const footers = await this.parseHeaderFooters(zip, 'footer');

    // 4. Load document.xml
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) {
      throw new Error('Invalid DOCX: missing word/document.xml');
    }

    // =========================================================================
    // PASS 1: Build Semantic Document Tree
    // =========================================================================
    const tree = new SemanticDocumentTree(fileName.replace(/\.[^/.]+$/, ''));

    // Extract <w:body> content
    const bodyMatch = docXml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/i);
    const bodyXml = bodyMatch ? bodyMatch[1] : docXml;

    // Match top-level blocks (<w:p>, <w:tbl>, <m:oMathPara>, <m:oMath>, <w:sdt>)
    const blockRegex = /<(w:p|w:tbl|m:oMathPara|m:oMath|w:sdt)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    let blockIndex = 1;

    let hasCode = false;
    let hasTables = false;
    let hasMath = false;

    // Temporary storage for accumulating contiguous code lines
    let pendingCodeLines: string[] = [];
    let pendingCodeRuns: TextRunNode[][] = [];
    let pendingCodeLang = 'python';

    const flushCodeBlock = () => {
      if (pendingCodeLines.length > 0) {
        hasCode = true;
        const rawCodeContent = pendingCodeLines.join('\n');
        const codeBlockId = `code_block_${blockIndex++}`;
        tree.addBlock({
          id: codeBlockId,
          type: 'CodeBlock',
          plainText: rawCodeContent,
          code: {
            type: 'code',
            id: codeBlockId,
            language: pendingCodeLang,
            content: rawCodeContent,
            fontFamily: 'monospace',
          },
          runs: pendingCodeRuns.flat(),
        });
        pendingCodeLines = [];
        pendingCodeRuns = [];
      }
    };

    while ((match = blockRegex.exec(bodyXml)) !== null) {
      const tag = match[1];
      const content = match[0];
      const blockId = `block_${blockIndex++}`;

      if (tag === 'w:p') {
        // Parse DrawingML & VML images inside this paragraph
        const attachedImage = this.findImageInParagraph(content, mediaMap);

        // Parse formatted text runs preserving spaces, tabs, line breaks
        const runs = this.parseParagraphRuns(content);
        const rawLineText = runs.map(r => r.text).join('');
        const trimmedText = rawLineText.trim();

        // Monospace font / code style detection
        const isMonospace = runs.some(r =>
          r.formatting.fontFamily && /consolas|courier|monaco|menlo|lucida console|fira code|source code|monospace/i.test(r.formatting.fontFamily)
        ) || /<w:pStyle\s+w:val="(?:Code|CodeBlock|PreformattedText|HTMLPreformatted)"/i.test(content);

        // Code block fence detection (e.g. ```python)
        const isCodeFence = /^```/i.test(trimmedText);

        if (isMonospace || isCodeFence) {
          if (isCodeFence) {
            const langMatch = trimmedText.match(/^```(\w+)/);
            if (langMatch) pendingCodeLang = langMatch[1];
          } else if (pendingCodeLines.length === 0) {
            pendingCodeLang = CodeBlockExtractor.detectLanguage(rawLineText) || 'python';
          }
          if (!isCodeFence) {
            pendingCodeLines.push(rawLineText);
            pendingCodeRuns.push(runs);
          }
          continue;
        } else {
          // Flush any pending contiguous code block
          flushCodeBlock();
        }

        const codeExtraction = CodeBlockExtractor.extractCodeBlocks(rawLineText);
        if (codeExtraction.codeBlocks.length > 0) {
          hasCode = true;
          const codeObj = codeExtraction.codeBlocks[0]!;
          tree.addBlock({
            id: blockId,
            type: 'CodeBlock',
            plainText: codeObj.content,
            code: codeObj,
            runs,
          });
          continue;
        }

        // Check for Hyperlinks <w:hyperlink r:id="rId">
        const hyperlinkMatch = content.match(/<w:hyperlink[^>]*r:id="([^"]+)"[^>]*>([\s\S]*?)<\/w:hyperlink>/i);
        let hyperlink: { text: string; url: string } | undefined;
        if (hyperlinkMatch) {
          const rId = hyperlinkMatch[1];
          const url = relsMap.get(rId) || 'https://www.python.org';
          const linkText = hyperlinkMatch[2].replace(/<[^>]+>/g, '').trim() || url;
          hyperlink = { text: linkText, url };
        }

        // Question Marker detection (Question 1:, Q1., Question 12, 1., 2., 12.)
        const isExplicitQMarker = /^(?:Q(?:uestion)?\s*\d+[\.\:\)]|Question[\:\s]+|Q\.\s*\d+|Problem\s*\d+[\.\:\)]?)/i.test(trimmedText);
        const isNumberedQMarker = /^\d+[\.\)]\s+/.test(trimmedText) && !/^(?:[\(\[]?[A-Da-d][\.\)\:]|Option\s+[A-Da-d0-9]+[\:\.]?)\s+/i.test(trimmedText);
        const isQMarker = isExplicitQMarker || isNumberedQMarker;

        // Check for List items (<w:numPr> or bullet/number prefix)
        const isNumPr = /<w:numPr>/i.test(content);
        const isBulletList = isNumPr || /^[*•\-]\s+/.test(trimmedText);
        const isOrderedList = !isQMarker && isNumPr && !isBulletList;

        // Check for Quote or Caption styles
        const isQuoteStyle = /<w:pStyle\s+w:val="(?:Quote|BlockQuote)"/i.test(content);
        const isCaptionStyle = /<w:pStyle\s+w:val="Caption"/i.test(content);

        // Heading detection
        const headingMatch = content.match(/<w:pStyle\s+w:val="Heading(\d)"/i);
        const headingLevel = headingMatch ? parseInt(headingMatch[1], 10) : undefined;

        // Option detection (A., B), C., (a), [A], Option A)
        const isExplicitOption = /^(?:[\(\[]?[A-Da-d][\.\)\:]|Option\s+[A-Da-d0-9]+[\:\.]?)\s+/i.test(trimmedText);
        const isGenericOption = /^(?:[\(\[]?[A-Za-z0-9]+[\.\)\:]|[*•\-])\s+/i.test(trimmedText) && !isQMarker;
        const isOption = (isExplicitOption || isGenericOption) && !isOrderedList && !isBulletList;

        // Answer / Explanation / Hint detection
        const isAnswer = /^(?:Answer|Ans|Correct Answer)[\:\s]+/i.test(trimmedText);
        const isExplanation = /^(?:Explanation|Solution)[\:\s]+/i.test(trimmedText);
        const isHint = /^(?:Hint|Clue)[\:\s]+/i.test(trimmedText);

        if (attachedImage) {
          tree.addBlock({
            id: blockId,
            type: 'Image',
            plainText: rawLineText || 'Image Block',
            media: attachedImage,
            runs,
            readingIndex: blockIndex,
          });
        }

        if (hyperlink) {
          tree.addBlock({
            id: blockId,
            type: 'Hyperlink',
            plainText: rawLineText,
            hyperlink,
            runs,
            readingIndex: blockIndex,
          });
        } else if (isQMarker) {
          tree.addBlock({
            id: blockId,
            type: 'QuestionMarker',
            plainText: rawLineText,
            headingLevel,
            runs,
            readingIndex: blockIndex,
          });
        } else if (isBulletList) {
          tree.addBlock({
            id: blockId,
            type: 'BulletList',
            plainText: rawLineText,
            listData: { style: 'unordered', items: [rawLineText.replace(/^[*•\-]\s*/, '')] },
            runs,
            readingIndex: blockIndex,
          });
        } else if (isOrderedList) {
          tree.addBlock({
            id: blockId,
            type: 'OrderedList',
            plainText: rawLineText,
            listData: { style: 'ordered', items: [rawLineText.replace(/^\d+[\.\)]\s*/, '')] },
            runs,
            readingIndex: blockIndex,
          });
        } else if (isOption) {
          tree.addBlock({
            id: blockId,
            type: 'Option',
            plainText: rawLineText,
            runs,
            readingIndex: blockIndex,
          });
        } else if (isAnswer) {
          tree.addBlock({
            id: blockId,
            type: 'Answer',
            plainText: rawLineText,
            runs,
            readingIndex: blockIndex,
          });
        } else if (isExplanation) {
          tree.addBlock({
            id: blockId,
            type: 'Explanation',
            plainText: rawLineText,
            runs,
            readingIndex: blockIndex,
          });
        } else if (isHint) {
          tree.addBlock({
            id: blockId,
            type: 'Hint',
            plainText: rawLineText,
            runs,
            readingIndex: blockIndex,
          });
        } else if (isCaptionStyle) {
          tree.addBlock({
            id: blockId,
            type: 'Caption',
            plainText: rawLineText,
            runs,
            readingIndex: blockIndex,
          });
        } else if (isQuoteStyle) {
          tree.addBlock({
            id: blockId,
            type: 'Quote',
            plainText: rawLineText,
            runs,
            readingIndex: blockIndex,
          });
        } else if (rawLineText.length > 0) {
          tree.addBlock({
            id: blockId,
            type: headingLevel ? 'Heading' : 'Paragraph',
            plainText: rawLineText,
            headingLevel,
            runs,
            readingIndex: blockIndex,
          });
        }
      } else if (tag === 'w:tbl') {
        flushCodeBlock();
        hasTables = true;
        const tableNode = TableExtractor.parseOpenXmlTable(content, `tbl_${blockId}`);
        if (tableNode.rowCount > 0) {
          tree.addBlock({
            id: blockId,
            type: 'Table',
            plainText: tableNode.plainText,
            table: tableNode,
            readingIndex: blockIndex,
          });
        }
      } else if (tag === 'm:oMathPara' || tag === 'm:oMath') {
        flushCodeBlock();
        hasMath = true;
        const latex = MathFormulaEngine.convertOmmlToLatex(content);
        if (latex) {
          const mathNode = {
            type: 'math' as const,
            id: `math_${blockId}`,
            displayType: 'block' as const,
            latex,
            ommlXml: content,
          };
          tree.addBlock({
            id: blockId,
            type: 'Formula',
            plainText: latex,
            math: mathNode,
            readingIndex: blockIndex,
          });
        }
      }
    }
    // Flush remaining code block at end of document if present
    flushCodeBlock();

    // Ensure ALL images in mediaMap are attached to tree blocks so zero images are lost
    for (const [rId, img] of mediaMap.entries()) {
      const alreadyCaptured = tree.mediaList.some(m => m.byteSize === img.byteSize || m.dataUrl === img.dataUrl);
      if (!alreadyCaptured) {
        tree.addBlock({
          id: `img_zip_${rId}`,
          type: 'Image',
          plainText: 'Embedded Image Asset',
          media: img,
          readingIndex: blockIndex++,
        });
        console.log(`[DocxOpenXmlParser] Attached non-inline/floating zip image: ${img.id}`);
      }
    }

    // =========================================================================
    // PASS 2: Educational Grouping Engine (Build Question Objects)
    // =========================================================================
    const questions = EducationalGroupingEngine.groupQuestions(tree);

    // Build AST and HTML output
    const astNodes = tree.blocks.map(b => {
      if (b.table) return b.table;
      if (b.code) return b.code;
      if (b.math) return b.math;
      return {
        type: 'paragraph' as const,
        id: b.id,
        headingLevel: b.headingLevel,
        runs: b.runs || [{ type: 'run' as const, text: b.plainText, formatting: {} }],
        plainText: b.plainText,
      };
    });

    const fullPlainText = tree.blocks.map(b => b.plainText).join('\n');

    return {
      sourceType: 'docx',
      rawContent: {
        text: fullPlainText,
        html: `<p>${fullPlainText}</p>`,
      },
      ast: {
        title: tree.title,
        metadata: {
          wordCount: fullPlainText.split(/\s+/).filter(Boolean).length,
          hasCode,
          hasTables,
          hasMath,
          hasImages: tree.mediaList.length > 0,
        },
        nodes: astNodes,
        footnotes,
        endnotes,
        comments,
        headers,
        footers,
      },
      questions,
      media: tree.mediaList,
      confidenceScore: 0.99,
    };
  }

  /**
   * Helper to parse DrawingML (<a:blip r:embed="rId">) and VML (<v:imagedata r:id="rId">) in a paragraph
   */
  private static findImageInParagraph(pXml: string, mediaMap: Map<string, ExtractedMedia>): ExtractedMedia | undefined {
    // Match DrawingML <a:blip r:embed="rIdX"> or <a:blip r:link="rIdX">
    const blipMatch = pXml.match(/<a:blip[^>]*r:(?:embed|link)="([^"]+)"/i);
    if (blipMatch) {
      const rId = blipMatch[1];
      if (mediaMap.has(rId)) return mediaMap.get(rId);
    }

    // Match VML <v:imagedata r:id="rIdX">
    const vmlMatch = pXml.match(/<v:imagedata[^>]*r:id="([^"]+)"/i);
    if (vmlMatch) {
      const rId = vmlMatch[1];
      if (mediaMap.has(rId)) return mediaMap.get(rId);
    }

    return undefined;
  }

  private static parseParagraphRuns(pXml: string): TextRunNode[] {
    const runs: TextRunNode[] = [];
    const rMatches = pXml.match(/<w:r[^>]*>([\s\S]*?)<\/w:r>/gi) || [];

    rMatches.forEach((rXml) => {
      const isBold = /<w:b\/>|<w:b\s+w:val="(true|1)"/i.test(rXml);
      const isItalic = /<w:i\/>|<w:i\s+w:val="(true|1)"/i.test(rXml);
      const isUnderline = /<w:u\s+w:val="([^"]+)"/i.test(rXml);
      const isStrike = /<w:strike\/>|<w:dstrike\/>/i.test(rXml);

      const colorMatch = rXml.match(/<w:color\s+w:val="([A-Fa-f0-9]{6})"/i);
      const color = colorMatch ? `#${colorMatch[1]}` : undefined;

      const hlMatch = rXml.match(/<w:highlight\s+w:val="([^"]+)"/i);
      const highlight = hlMatch ? hlMatch[1] : undefined;

      const fontMatch = rXml.match(/<w:rFonts\s+[^>]*w:ascii="([^"]+)"/i);
      const fontFamily = fontMatch ? fontMatch[1] : undefined;

      const vertAlignMatch = rXml.match(/<w:vertAlign\s+w:val="(superscript|subscript)"/i);
      const superscript = vertAlignMatch?.[1] === 'superscript';
      const subscript = vertAlignMatch?.[1] === 'subscript';

      const szMatch = rXml.match(/<w:sz\s+w:val="(\d+)"/i);
      const fontSize = szMatch ? parseInt(szMatch[1], 10) / 2 : undefined;

      // Extract inner run elements in exact document order (<w:t>, <w:tab/>, <w:br/>, <w:cr/>, <w:noBreakHyphen/>)
      const elementMatches = rXml.match(/<(w:t|w:tab|w:br|w:cr|w:noBreakHyphen)[^>]*>([\s\S]*?)<\/\1>|<(w:tab|w:br|w:cr|w:noBreakHyphen)\/>/gi) || [];
      let text = '';

      elementMatches.forEach((el) => {
        if (/<w:tab/i.test(el)) {
          text += '\t';
        } else if (/<w:br/i.test(el) || /<w:cr/i.test(el)) {
          text += '\n';
        } else if (/<w:noBreakHyphen/i.test(el)) {
          text += '-';
        } else {
          text += el.replace(/<[^>]+>/g, '');
        }
      });

      if (text.length > 0) {
        runs.push({
          type: 'run',
          text,
          formatting: {
            bold: isBold,
            italic: isItalic,
            underline: isUnderline,
            strikethrough: isStrike,
            color,
            highlight,
            fontFamily,
            fontSize,
            superscript,
            subscript,
          },
        });
      }
    });

    return runs;
  }

  private static async parseRelationships(zip: JSZip): Promise<Map<string, string>> {
    const relsMap = new Map<string, string>();
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
    if (!relsXml) return relsMap;

    const matches = relsXml.match(/<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gi) || [];
    matches.forEach((m) => {
      const idMatch = m.match(/Id="([^"]+)"/);
      const targetMatch = m.match(/Target="([^"]+)"/);
      if (idMatch && targetMatch) {
        relsMap.set(idMatch[1], targetMatch[1]);
      }
    });

    return relsMap;
  }

  private static async extractMediaMapFromZip(zip: JSZip, relsMap: Map<string, string>): Promise<Map<string, ExtractedMedia>> {
    const mediaMap = new Map<string, ExtractedMedia>();
    const mediaFiles = Object.keys(zip.files).filter(
      filename => /^word\/media\//i.test(filename) && !zip.files[filename].dir
    );

    for (let i = 0; i < mediaFiles.length; i++) {
      const filename = mediaFiles[i];
      const fileObj = zip.files[filename];
      const buffer = await fileObj.async('nodebuffer');

      const ext = filename.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png';
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      const mediaItem: ExtractedMedia = {
        id: `img_docx_${i + 1}`,
        fileName: filename.split('/').pop() || `image_${i + 1}.${ext}`,
        mimeType,
        dataUrl,
        buffer,
        byteSize: buffer.length,
        anchorType: 'inline',
      };

      for (const [id, target] of relsMap.entries()) {
        if (target.includes(filename.replace('word/', ''))) {
          mediaItem.relationshipId = id;
          mediaMap.set(id, mediaItem);
        }
      }
      mediaMap.set(filename, mediaItem);
    }

    return mediaMap;
  }

  private static async parseFootnotes(zip: JSZip): Promise<{ id: string; text: string }[]> {
    const fnXml = await zip.file('word/footnotes.xml')?.async('string');
    if (!fnXml) return [];
    const matches = fnXml.match(/<w:footnote[^>]*w:id="(\d+)"[^>]*>([\s\S]*?)<\/w:footnote>/gi) || [];
    return matches.map((m) => {
      const id = (m.match(/w:id="(\d+)"/) || ['', ''])[1];
      const text = m.replace(/<[^>]+>/g, '').trim();
      return { id, text };
    }).filter(f => f.text.length > 0);
  }

  private static async parseEndnotes(zip: JSZip): Promise<{ id: string; text: string }[]> {
    const enXml = await zip.file('word/endnotes.xml')?.async('string');
    if (!enXml) return [];
    const matches = enXml.match(/<w:endnote[^>]*w:id="(\d+)"[^>]*>([\s\S]*?)<\/w:endnote>/gi) || [];
    return matches.map((m) => {
      const id = (m.match(/w:id="(\d+)"/) || ['', ''])[1];
      const text = m.replace(/<[^>]+>/g, '').trim();
      return { id, text };
    }).filter(f => f.text.length > 0);
  }

  private static async parseComments(zip: JSZip): Promise<{ id: string; author: string; text: string }[]> {
    const cmXml = await zip.file('word/comments.xml')?.async('string');
    if (!cmXml) return [];
    const matches = cmXml.match(/<w:comment[^>]*w:id="(\d+)"[^>]*w:author="([^"]*)"[^>]*>([\s\S]*?)<\/w:comment>/gi) || [];
    return matches.map((m) => {
      const id = (m.match(/w:id="(\d+)"/) || ['', ''])[1];
      const author = (m.match(/w:author="([^"]*)"/) || ['', 'Author'])[1];
      const text = m.replace(/<[^>]+>/g, '').trim();
      return { id, author, text };
    }).filter(c => c.text.length > 0);
  }

  private static async parseHeaderFooters(zip: JSZip, type: 'header' | 'footer'): Promise<string[]> {
    const files = Object.keys(zip.files).filter(f => new RegExp(`^word/${type}\\d*\\.xml$`, 'i').test(f));
    const results: string[] = [];
    for (const f of files) {
      const xml = await zip.files[f].async('string');
      const text = xml.replace(/<[^>]+>/g, '').trim();
      if (text) results.push(text);
    }
    return results;
  }
}
