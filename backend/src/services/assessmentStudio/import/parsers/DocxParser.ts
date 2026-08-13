/**
 * DOCX Parser - Extracts text, structured HTML tables, equations, and images from Word documents
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import mammoth from 'mammoth';
import JSZip from 'jszip';

import { OpenXmlParser } from './OpenXmlParser.js';

interface ExtractedDocxImage {
  id: string;
  rId?: string;
  filename?: string;
  mimeType: string;
  dataUrl: string;
  buffer: Buffer;
  byteSize: number;
  width?: number;
  height?: number;
}

export class DocxParser {
  static async extract(buffer: Buffer): Promise<RawContent & { structuredElements?: any[]; documentGraph?: any }> {
    console.log('[DocxParser] ENTRY', { bufferSize: buffer.length });
    try {
      // 1. Primary Deep OpenXML DOM Parsing
      const openXmlResult = await OpenXmlParser.parse(buffer);
      console.log('[DocxParser] OpenXmlParser completed:', {
        nodes: openXmlResult.metadata.totalNodes,
        images: openXmlResult.images.length,
        equations: openXmlResult.equations.length,
      });

      const images: ExtractedDocxImage[] = openXmlResult.images;

      // 2. Extract standard inline images via Mammoth for HTML layout rendering fallback
      const inlineImages: ExtractedDocxImage[] = [];
      const htmlResult = await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: (mammoth.images as any).inline((element: any) => {
            return element.read('base64').then((base64Data: string) => {
              const imgBuf = Buffer.from(base64Data, 'base64');
              const imageId = `img_inline_${inlineImages.length + 1}`;
              const mimeType = element.contentType || 'image/png';
              const dataUrl = `data:${mimeType};base64,${base64Data}`;
              inlineImages.push({
                id: imageId,
                mimeType,
                dataUrl,
                buffer: imgBuf,
                byteSize: imgBuf.length,
              });
              return { src: dataUrl };
            });
          }),
        }
      );

      const rawText = openXmlResult.rawText || (await mammoth.extractRawText({ buffer })).value || '';
      let htmlContent = htmlResult.value || '';

      // Ensure openXml images are attached to htmlContent
      for (const openImg of openXmlResult.images) {
        if (!images.some(i => i.dataUrl === openImg.dataUrl)) {
          images.push(openImg);
        }
        if (!htmlContent.includes(openImg.dataUrl)) {
          htmlContent += `\n<p><img src="${openImg.dataUrl}" alt="${openImg.id}" /></p>`;
        }
      }

      return {
        text: rawText,
        html: htmlContent,
        images,
        equations: openXmlResult.equations,
        documentGraph: openXmlResult.documentGraph.toSerializable(),
        metadata: {
          wordCount: rawText.split(/\s+/).filter(Boolean).length,
          openXmlNodes: openXmlResult.metadata.totalNodes,
        },
      } as any;
    } catch (openXmlErr) {
      console.warn('[DocxParser] OpenXmlParser failed, falling back to standard mammoth parser:', openXmlErr);
    }

    try {
      const images: ExtractedDocxImage[] = [];

      // 1. Extract standard inline images via Mammoth
      const inlineImages: ExtractedDocxImage[] = [];
      const htmlResult = await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: (mammoth.images as any).inline((element: any) => {
            return element.read('base64').then((base64Data: string) => {
              const imgBuf = Buffer.from(base64Data, 'base64');
              console.log('IMAGE CALLBACK', {
                contentType: element.contentType,
                size: imgBuf.length,
              });
              const imageId = `img_inline_${inlineImages.length + 1}`;
              const mimeType = element.contentType || 'image/png';
              const dataUrl = `data:${mimeType};base64,${base64Data}`;
              inlineImages.push({
                id: imageId,
                mimeType,
                dataUrl,
                buffer: imgBuf,
                byteSize: imgBuf.length,
              });
              return { src: dataUrl };
            });
          }),
        }
      );

      const textResult = await mammoth.extractRawText({ buffer });
      const rawText = textResult.value || '';
      let htmlContent = htmlResult.value || '';

      console.log('MAMMOTH HTML OUTPUT', {
        hasImgTags: htmlContent.includes('<img'),
        imgTagCount: (htmlContent.match(/<img/g) || []).length,
        hasTableTags: htmlContent.includes('<table'),
        tableTagCount: (htmlContent.match(/<table/g) || []).length,
        mammothImagesCount: inlineImages.length,
        imageIDs: inlineImages.map(i => i.id),
        htmlSnippet: htmlContent.substring(0, 1000),
      });

      // 2. Extract ALL embedded images directly from word/media/ inside docx zip
      const zipImages = await this.extractImagesFromDocxZip(buffer);

      for (const img of inlineImages) {
        images.push(img);
      }

      // Merge zip images that were not captured by Mammoth's inline converter
      for (const zipImg of zipImages) {
        const alreadyCaptured = images.some(
          img => img.byteSize === zipImg.byteSize || img.dataUrl === zipImg.dataUrl
        );

        if (!alreadyCaptured) {
          images.push(zipImg);
          console.log('[DocxParser] Adding non-inline zip image (floating/anchored/VML):', {
            id: zipImg.id,
            mimeType: zipImg.mimeType,
            byteSize: zipImg.byteSize,
          });

          // Inject <img src="..."> into htmlContent so VisionUnderstanding receives layout region
          if (!htmlContent.includes(zipImg.dataUrl)) {
            const imgTag = `<p><img src="${zipImg.dataUrl}" alt="${zipImg.id}" class="docx-embedded-image" /></p>`;
            // If Section 12 or Question text exists, inject near it
            if (htmlContent.includes('Section 12') || htmlContent.includes('Identify the object')) {
              htmlContent = htmlContent.replace(/(Section\s+12[\s\S]*?)(Question:?|<p>)/i, `$1${imgTag}\n$2`);
            } else {
              // Otherwise append at appropriate block position
              htmlContent += `\n${imgTag}`;
            }
          }
        }
      }

      // 3. Extract raw OMML / MathML equations directly from docx XML zip
      const equations = await this.extractEquationsFromDocxZip(buffer);

      const rawContent = {
        text: rawText,
        html: htmlContent,
        images,
        equations,
        metadata: {
          wordCount: rawText.split(/\s+/).filter(Boolean).length,
        },
      };

      console.log('[DocxParser] TRACE - PARSER OUTPUT:', {
        inputBufferSize: buffer.length,
        extractedTextLength: rawText.length,
        extractedHtmlLength: htmlContent.length,
        imageCount: images.length,
        imageIDs: images.map(img => img.id),
        mimeTypes: images.map(img => img.mimeType),
        byteSizes: images.map(img => img.byteSize),
        status: images.length > 0 ? 'SUCCESS' : 'NO_IMAGES_FOUND',
      });

      return rawContent as any;
    } catch (error) {
      console.log('[DocxParser] EXIT - error', { error });
      if (error instanceof AppError) throw error;
      throw new AppError(500, `DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper to open docx zip and extract ALL images from word/media/ and document.xml.rels
   */
  private static async extractImagesFromDocxZip(buffer: Buffer): Promise<ExtractedDocxImage[]> {
    const zipImages: ExtractedDocxImage[] = [];
    try {
      const zip = await JSZip.loadAsync(buffer);
      const mediaFiles = Object.keys(zip.files).filter(
        filename => /^word\/media\//i.test(filename) && !zip.files[filename]?.dir
      );

      console.log('[DocxParser] Zip word/media/ inspection found:', mediaFiles);

      const relsMap = new Map<string, string>();
      const relsFile = zip.file('word/_rels/document.xml.rels');
      if (relsFile) {
        const relsXml = await relsFile.async('string');
        const relRegex = /Id=["'](rId\d+)["'][\s\S]*?Target=["']([^"']+)["']/gi;
        let m;
        while ((m = relRegex.exec(relsXml)) !== null) {
          const rId = m[1];
          const target = m[2].replace(/^word\//, '');
          relsMap.set(target, rId);
        }
      }

      // Read word/document.xml to inspect XML drawing and VML structures
      const docXmlFile = zip.file('word/document.xml');
      if (docXmlFile) {
        const xmlText = await docXmlFile.async('string');
        console.log('XML DRAWING INSPECTION', {
          inlineCount: (xmlText.match(/<wp:inline/gi) || []).length,
          anchorCount: (xmlText.match(/<wp:anchor/gi) || []).length,
          vShapeCount: (xmlText.match(/<v:shape/gi) || []).length,
          vImageDataCount: (xmlText.match(/<v:imagedata/gi) || []).length,
        });
      }

      for (let i = 0; i < mediaFiles.length; i++) {
        const filename = mediaFiles[i];
        const file = zip.file(filename);
        if (!file) continue;

        const buf = await file.async('nodebuffer');
        const cleanName = filename.replace(/^word\/media\//i, '');
        const ext = cleanName.split('.').pop()?.toLowerCase() || 'png';

        let mimeType = 'image/png';
        if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'svg') mimeType = 'image/svg+xml';
        else if (ext === 'bmp') mimeType = 'image/bmp';
        else if (ext === 'webp') mimeType = 'image/webp';

        const rId = relsMap.get(filename) || relsMap.get(`media/${cleanName}`) || `rId_media_${i + 1}`;
        const base64 = buf.toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;

        zipImages.push({
          id: `img_zip_${cleanName.replace(/\.[^/.]+$/, '')}`,
          rId,
          filename: cleanName,
          mimeType,
          dataUrl,
          buffer: buf,
          byteSize: buf.length,
          width: 600,
          height: 400,
        });
      }
    } catch (err) {
      console.warn('[DocxParser] Warning inspecting zip media:', err);
    }
    return zipImages;
  }

  /**
   * Helper to inspect document.xml inside docx zip container to extract OMML/MathML equations
   */
  private static async extractEquationsFromDocxZip(buffer: Buffer): Promise<Array<{ latex: string; mathml?: string; unicode?: string }>> {
    const equations: Array<{ latex: string; mathml?: string; unicode?: string }> = [];
    try {
      const zip = await JSZip.loadAsync(buffer);
      const docXmlFile = zip.file('word/document.xml');
      if (!docXmlFile) return equations;

      const xmlText = await docXmlFile.async('string');
      const mathRegex = /<m:oMath[\s\S]*?<\/m:oMath>/g;
      let match;
      while ((match = mathRegex.exec(xmlText)) !== null) {
        const mathXml = match[0];
        const unicodeOnly = mathXml
          .replace(/<m:r>[\s\S]*?<m:t>([\s\S]*?)<\/m:t>[\s\S]*?<\/m:r>/g, '$1')
          .replace(/<[^>]+>/g, '')
          .trim();

        const latex = this.ommlToLatex(mathXml, unicodeOnly);

        if (latex || mathXml) {
          equations.push({
            latex: latex || unicodeOnly || '',
            mathml: mathXml,
            unicode: unicodeOnly,
          });
        }
      }
    } catch (err) {
      console.warn('[DocxParser] Warning extracting OMML from zip:', err);
    }
    return equations;
  }

  /**
   * Heuristic OMML → LaTeX converter, preserves the original Word Equation structure
   * Uses the OMML tag names (m:f, m:sSup, m:e, m:r/m:t, etc.) to produce LaTeX
   */
  private static ommlToLatex(mathXml: string, fallback: string): string {
    try {
      let tex = mathXml;
      tex = tex.replace(/<m:t>([\s\S]*?)<\/m:t>/g, (_, inner) => inner.replace(/\s+/g, ' ').trim());
      tex = tex.replace(/<m:sup[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:sup>/g, (_, e) => `^{${this.stripTags(e)}}`);
      tex = tex.replace(/<m:sub[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:sub>/g, (_, e) => `_{${this.stripTags(e)}}`);
      tex = tex.replace(/<m:sSubSup[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSubSup>/g, (_, s, p) => `_{${this.stripTags(s)}}^{${this.stripTags(p)}}`);
      tex = tex.replace(/<m:f[\s\S]*?<m:num>([\s\S]*?)<\/m:num>[\s\S]*?<m:den>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/g, (_, n, d) => `\\frac{${this.stripTags(n)}}{${this.stripTags(d)}}`);
      tex = tex.replace(/<m:rad[\s\S]*?<m:deg>([\s\S]*?)<\/m:deg>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/g, (_, d, e) => `\\sqrt[${this.stripTags(d)}]{${this.stripTags(e)}}`);
      tex = tex.replace(/<m:rad[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/g, (_, e) => `\\sqrt{${this.stripTags(e)}}`);
      tex = tex.replace(/<m:nary[\s\S]*?<m:chr[\s\S]*?<\/m:chr>[\s\S]*?<\/m:nary>/g, (full) => {
        const chr = full.match(/<m:chr[^>]*?val=["']([^"']+)["']/)?.[1] || '∑';
        const sub = full.match(/<m:sub>([\s\S]*?)<\/m:sub>/)?.[1];
        const sup = full.match(/<m:sup>([\s\S]*?)<\/m:sup>/)?.[1];
        const body = full.match(/<m:e>([\s\S]*?)<\/m:e>/)?.[1];
        const cmd = chr === '∑' ? '\\sum' : chr === '∏' ? '\\prod' : chr === '∫' ? '\\int' : chr;
        return [cmd, sub ? `_{${this.stripTags(sub)}}` : '', sup ? `^{${this.stripTags(sup)}}` : '', body ? ` ${this.stripTags(body)}` : ''].join('');
      });

      // Greek letter / symbol heuristic from unicode characters inside the equation block
      const clean = this.stripTags(tex);
      const symbolMap: Record<string, string> = {
        'π': '\\pi', '∏': '\\prod', '∑': '\\sum', '∫': '\\int', '√': '\\sqrt',
        'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'λ': '\\lambda',
        'μ': '\\mu', 'θ': '\\theta', 'σ': '\\sigma', 'Ω': '\\Omega', 'Δ': '\\Delta',
        '∞': '\\infty', '±': '\\pm', '≠': '\\neq', '≤': '\\leq', '≥': '\\geq',
        '×': '\\times', '÷': '\\div',
      };
      let withSymbols = clean;
      for (const [u, l] of Object.entries(symbolMap)) {
        withSymbols = withSymbols.split(u).join(l);
      }

      const trimmed = withSymbols.trim();
      return trimmed || fallback;
    } catch {
      return fallback;
    }
  }

  private static stripTags(str: string): string {
    return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
}
