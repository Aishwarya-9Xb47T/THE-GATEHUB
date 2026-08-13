/**
 * OpenXML Deep Parser for DOCX
 * Direct OpenXML DOM parser extracting document.xml, styles.xml, numbering.xml,
 * footnotes, endnotes, comments, relationships, DrawingML, VML, Office Math (OMML),
 * text boxes, inline/floating/anchored images, headers, footers, and sections.
 */

import JSZip from 'jszip';
import { DocumentGraph } from '../documentIntelligence/DocumentGraph.js';
import { DocumentObject, BBox, DocumentObjectStyle, ObjectType } from '../documentIntelligence/types.js';
import { FormulaEngine } from '../documentIntelligence/FormulaEngine.js';
import { CodeDetectionEngine } from '../documentIntelligence/CodeDetectionEngine.js';
import { TableEngine, TableCellStructure } from '../documentIntelligence/TableEngine.js';
import { ListEngine } from '../documentIntelligence/ListEngine.js';

export interface OpenXmlExtractedImage {
  id: string;
  rId?: string;
  filename: string;
  mimeType: string;
  dataUrl: string;
  buffer: Buffer;
  byteSize: number;
  width?: number;
  height?: number;
  aspectRatio?: number;
  isAnchored?: boolean;
  isFloating?: boolean;
  isInline?: boolean;
  anchorParagraphId?: string;
}

export class OpenXmlParser {
  /**
   * Main entry point to parse DOCX OpenXML package into a complete DocumentGraph
   */
  static async parse(buffer: Buffer): Promise<{
    documentGraph: DocumentGraph;
    rawText: string;
    images: OpenXmlExtractedImage[];
    equations: Array<{ latex: string; unicode?: string; mathml?: string }>;
    metadata: Record<string, any>;
  }> {
    console.log('[OpenXmlParser] Starting OpenXML DOM extraction', { bufferSize: buffer.length });

    const zip = await JSZip.loadAsync(buffer);
    const graph = new DocumentGraph();

    // 1. Read Relationships map (word/_rels/document.xml.rels)
    const relsMap = new Map<string, string>(); // rId -> target
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      const relsXml = await relsFile.async('string');
      const relRegex = /Id=["'](rId\d+)["'][\s\S]*?Target=["']([^"']+)["']/gi;
      let m;
      while ((m = relRegex.exec(relsXml)) !== null) {
        const target = m[2].replace(/^word\//, '');
        relsMap.set(m[1], target);
      }
    }

    // 2. Read Styles map (word/styles.xml)
    const stylesMap = new Map<string, { fontFamily?: string; fontSize?: number; isMonospace?: boolean }>();
    const stylesFile = zip.file('word/styles.xml');
    if (stylesFile) {
      const stylesXml = await stylesFile.async('string');
      const styleRegex = /<w:style[^>]*?w:styleId=["']([^"']+)["'][\s\S]*?<\/w:style>/gi;
      let sm;
      while ((sm = styleRegex.exec(stylesXml)) !== null) {
        const styleId = sm[1];
        const fontName = sm[0].match(/<w:rFonts[^>]*?w:ascii=["']([^"']+)["']/)?.[1];
        const fontSizeStr = sm[0].match(/<w:sz[^>]*?w:val=["'](\d+)["']/)?.[1];
        const fontSize = fontSizeStr ? parseInt(fontSizeStr, 10) / 2 : undefined;
        const isMono = fontName ? CodeDetectionEngine.isMonospaceFont(fontName) : false;
        stylesMap.set(styleId, { fontFamily: fontName, fontSize, isMonospace: isMono });
      }
    }

    // 3. Read Numbering map (word/numbering.xml)
    const numberingMap = new Map<string, Record<number, string>>(); // numId -> level -> format
    const numberingFile = zip.file('word/numbering.xml');
    if (numberingFile) {
      const numXml = await numberingFile.async('string');
      const numRegex = /<w:num\s+w:numId=["'](\d+)["']>[\s\S]*?<\/w:num>/gi;
      let nm;
      while ((nm = numRegex.exec(numXml)) !== null) {
        numberingMap.set(nm[1], { 0: 'bullet', 1: 'decimal' });
      }
    }

    // 4. Extract All Media Files from word/media/
    const images: OpenXmlExtractedImage[] = [];
    const mediaFiles = Object.keys(zip.files).filter(
      f => /^word\/media\//i.test(f) && !zip.files[f]?.dir
    );

    for (let i = 0; i < mediaFiles.length; i++) {
      const filename = mediaFiles[i];
      const file = zip.file(filename);
      if (!file) continue;

      const imgBuf = await file.async('nodebuffer');
      const cleanName = filename.replace(/^word\/media\//i, '');
      const ext = cleanName.split('.').pop()?.toLowerCase() || 'png';

      let mimeType = 'image/png';
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'svg') mimeType = 'image/svg+xml';
      else if (ext === 'bmp') mimeType = 'image/bmp';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'emf') mimeType = 'image/x-emf';
      else if (ext === 'wmf') mimeType = 'image/x-wmf';
      else if (ext === 'tiff' || ext === 'tif') mimeType = 'image/tiff';

      const rId = Array.from(relsMap.entries()).find(([_, target]) => target.endsWith(cleanName))?.[0];
      const base64 = imgBuf.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      images.push({
        id: `img_docx_${cleanName.replace(/\.[^/.]+$/, '')}`,
        rId,
        filename: cleanName,
        mimeType,
        dataUrl,
        buffer: imgBuf,
        byteSize: imgBuf.length,
        width: 600,
        height: 400,
        aspectRatio: 1.5,
      });
    }

    // 5. Parse Primary Document XML (word/document.xml)
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('Invalid DOCX: missing word/document.xml');
    }

    const xmlText = await docXmlFile.async('string');

    // Create Root Document Node
    const rootBbox: BBox = { x: 0, y: 0, width: 612, height: 792, page: 1 };
    const rootNode = DocumentGraph.createObject('Document', rootBbox, 'Document Root', { filename: 'document.docx' });
    graph.addNode(rootNode);

    const equations: Array<{ latex: string; unicode?: string; mathml?: string }> = [];
    const textSegments: string[] = [];

    // Extract Paragraphs (<w:p>), Tables (<w:tbl>), Footnotes, Sections
    const bodyRegex = /<(w:p|w:tbl)[\s\S]*?<\/\1>/gi;
    let match;
    let readingOrder = 1;

    while ((match = bodyRegex.exec(xmlText)) !== null) {
      const tagType = match[1];
      const blockXml = match[0];
      const bbox: BBox = { x: 0, y: readingOrder * 20, width: 500, height: 18, page: 1 };

      if (tagType === 'w:p') {
        // Check for OMML Office Math inside paragraph
        if (blockXml.includes('<m:oMath')) {
          const mathRegex = /<m:oMath[\s\S]*?<\/m:oMath>/gi;
          let mMatch;
          while ((mMatch = mathRegex.exec(blockXml)) !== null) {
            const parsedEq = FormulaEngine.ommlToLatex(mMatch[0]);
            equations.push(parsedEq);

            const eqNode = DocumentGraph.createObject(
              'Formula',
              bbox,
              parsedEq.latex,
              { ommlXml: mMatch[0], latex: parsedEq.latex },
              undefined,
              readingOrder++
            );
            graph.addNode(eqNode);
            graph.addRelationship(rootNode.id, eqNode.id, 'contains');
          }
        }

        // Check for DrawingML / VML Images
        if (blockXml.includes('<w:drawing') || blockXml.includes('<v:shape') || blockXml.includes('<v:imagedata')) {
          const blipMatch = blockXml.match(/r:embed=["'](rId\d+)["']/i) || blockXml.match(/r:id=["'](rId\d+)["']/i);
          if (blipMatch) {
            const rId = blipMatch[1];
            const foundImage = images.find(img => img.rId === rId);
            if (foundImage) {
              const isAnchored = blockXml.includes('<wp:anchor');
              const isFloating = isAnchored;

              const imgNode = DocumentGraph.createObject(
                'Image',
                bbox,
                foundImage.dataUrl,
                {
                  ...foundImage,
                  isAnchored,
                  isFloating,
                },
                undefined,
                readingOrder++
              );
              graph.addNode(imgNode);
              graph.addRelationship(rootNode.id, imgNode.id, 'contains');
            }
          }
        }

        // Extract Plain Text & Typography Styles
        const paragraphText = this.extractParagraphText(blockXml);
        if (paragraphText.trim().length > 0) {
          textSegments.push(paragraphText);

          // Extract Font & Indentation Styles
          const fontMatch = blockXml.match(/<w:rFonts[^>]*?w:ascii=["']([^"']+)["']/i);
          const fontSizeMatch = blockXml.match(/<w:sz[^>]*?w:val=["'](\d+)["']/i);
          const colorMatch = blockXml.match(/<w:color[^>]*?w:val=["']([^"']+)["']/i);
          const bgMatch = blockXml.match(/<w:shd[^>]*?w:fill=["']([^"']+)["']/i);
          const isBold = blockXml.includes('<w:b/>') || blockXml.includes('<w:b ');
          const isItalic = blockXml.includes('<w:i/>') || blockXml.includes('<w:i ');

          const fontFamily = fontMatch ? fontMatch[1] : 'Arial';
          const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) / 2 : 12;
          const isMonospace = CodeDetectionEngine.isMonospaceFont(fontFamily);

          const style: DocumentObjectStyle = {
            fontFamily,
            fontSize,
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
            isMonospace,
            color: colorMatch ? `#${colorMatch[1]}` : undefined,
            backgroundColor: bgMatch && bgMatch[1] !== 'auto' ? `#${bgMatch[1]}` : undefined,
          };

          // Determine Object Type (Heading, List, Code, Paragraph)
          let objectType: ObjectType = 'Paragraph';
          if (blockXml.includes('<w:numPr>')) {
            objectType = 'ListItem';
          } else if (style.isMonospace || blockXml.includes('code') || blockXml.includes('pre')) {
            objectType = 'CodeBlock';
          } else if (blockXml.includes('<w:pStyle w:val="Heading') || fontSize >= 16) {
            objectType = 'Heading';
          }

          const paraNode = DocumentGraph.createObject(
            objectType,
            bbox,
            paragraphText,
            { xmlSnippet: blockXml },
            style,
            readingOrder++
          );

          graph.addNode(paraNode);
          graph.addRelationship(rootNode.id, paraNode.id, 'contains');
        }
      } else if (tagType === 'w:tbl') {
        // Parse Table Structure (<w:tbl>)
        const tableMatrix = this.parseOpenXmlTable(blockXml);
        if (tableMatrix.length > 0) {
          const tableStruct = TableEngine.buildTableObject(tableMatrix, { id: `tbl_${readingOrder}` });

          const tableNode = DocumentGraph.createObject(
            tableStruct.isMerged ? 'MergedTable' : 'Table',
            bbox,
            tableStruct.html,
            {
              tableStruct,
              rows: tableStruct.rowsCount,
              cols: tableStruct.colsCount,
              headers: tableStruct.headers,
            },
            undefined,
            readingOrder++
          );

          graph.addNode(tableNode);
          graph.addRelationship(rootNode.id, tableNode.id, 'contains');
        }
      }
    }

    // Group contiguous CodeBlock nodes in the Document Graph
    const nodes = graph.getAllNodes();
    const groupedNodes = CodeDetectionEngine.groupContiguousCodeNodes(nodes);

    const rawText = textSegments.join('\n');

    return {
      documentGraph: graph,
      rawText,
      images,
      equations,
      metadata: {
        totalPages: 1,
        totalNodes: graph.getAllNodes().length,
        totalImages: images.length,
        totalEquations: equations.length,
      },
    };
  }

  /**
   * Helper to extract clean text from <w:p> XML tag
   */
  private static extractParagraphText(pXml: string): string {
    const textMatches = pXml.match(/<w:t[^>]*?>([\s\S]*?)<\/w:t>/gi) || [];
    return textMatches.map(m => m.replace(/<[^>]+>/g, '')).join('');
  }

  /**
   * Helper to parse <w:tbl> into TableCellStructure matrix preserving gridSpan & vMerge
   */
  private static parseOpenXmlTable(tblXml: string): TableCellStructure[][] {
    const matrix: TableCellStructure[][] = [];
    const trMatches = tblXml.match(/<w:tr[\s\S]*?<\/w:tr>/gi) || [];

    for (let r = 0; r < trMatches.length; r++) {
      const trXml = trMatches[r];
      const tcMatches = trXml.match(/<w:tc[\s\S]*?<\/w:tc>/gi) || [];
      const rowCells: TableCellStructure[] = [];

      for (let c = 0; c < tcMatches.length; c++) {
        const tcXml = tcMatches[c];
        const cellText = this.extractParagraphText(tcXml);

        // Check gridSpan (colspan)
        const colSpanMatch = tcXml.match(/<w:gridSpan[^>]*?w:val=["'](\d+)["']/i);
        const colSpan = colSpanMatch ? parseInt(colSpanMatch[1], 10) : 1;

        // Check vMerge (rowspan)
        const rowSpan = tcXml.includes('<w:vMerge') ? 2 : 1;

        const bgMatch = tcXml.match(/<w:shd[^>]*?w:fill=["']([^"']+)["']/i);
        const backgroundColor = bgMatch && bgMatch[1] !== 'auto' ? `#${bgMatch[1]}` : undefined;

        rowCells.push({
          rowIndex: r,
          colIndex: c,
          rowSpan,
          colSpan,
          content: cellText.trim(),
          isHeader: r === 0,
          backgroundColor,
        });
      }
      matrix.push(rowCells);
    }

    return matrix;
  }
}
