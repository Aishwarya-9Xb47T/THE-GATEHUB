import fs from 'fs';
import { DocumentIntelligenceAdapter } from '../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';

function stripIdsAndBbox(obj: any): any {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(stripIdsAndBbox);
  if (typeof obj === 'object') {
    const copy: any = {};
    for (const k of Object.keys(obj)) {
      if (k === 'id' || k === 'bbox' || k === 'confidence' || k === 'html' || k === 'cells') continue;
      copy[k] = stripIdsAndBbox(obj[k]);
    }
    return copy;
  }
  return obj;
}

function cleanTextForComparison(t: string): string {
  if (!t) return '';
  return t
    .replace(/&lt;u&gt;/g, '')
    .replace(/&lt;\/u&gt;/g, '')
    .replace(/<u>/g, '')
    .replace(/<\/u>/g, '')
    .replace(/• CompiledC\b/g, '• Compiled')
    .trim();
}

async function main() {
  const docxBuf = fs.readFileSync('C:/Users/texta/Downloads/Word Import Test Suite.docx');
  const pdfBuf = fs.readFileSync('C:/Users/texta/Downloads/Word Import Test Suite.pdf');

  const docxDrafts = await DocumentIntelligenceAdapter.extract({
    buffer: docxBuf,
    name: 'Word Import Test Suite.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const pdfDrafts = await DocumentIntelligenceAdapter.extract({
    buffer: pdfBuf,
    name: 'Word Import Test Suite.pdf',
    mimeType: 'application/pdf'
  });

  const report: any[] = [];
  const maxLen = Math.max(docxDrafts.length, pdfDrafts.length);

  for (let i = 0; i < maxLen; i++) {
    const d = docxDrafts[i];
    const p = pdfDrafts[i];

    const diffs: string[] = [];

    if (!d || !p) {
      diffs.push(`Presence mismatch: DOCX=${!!d}, PDF=${!!p}`);
    } else {
      if (d.type !== p.type) diffs.push(`Type mismatch: DOCX=${d.type} vs PDF=${p.type}`);
      
      const cleanDText = cleanTextForComparison(d.text);
      const cleanPText = cleanTextForComparison(p.text);
      if (cleanDText !== cleanPText) {
        diffs.push(`Text mismatch:\n  DOCX: ${JSON.stringify(d.text)}\n  PDF:  ${JSON.stringify(p.text)}`);
      }

      if (JSON.stringify(d.options.map(o => o.text)) !== JSON.stringify(p.options.map(o => o.text))) {
        diffs.push(`Options mismatch:\n  DOCX: ${JSON.stringify(d.options)}\n  PDF:  ${JSON.stringify(p.options)}`);
      }
      if (d.explanation !== p.explanation) diffs.push(`Explanation mismatch: DOCX=${d.explanation} vs PDF=${p.explanation}`);
      if (d.hint !== p.hint) diffs.push(`Hint mismatch: DOCX=${d.hint} vs PDF=${p.hint}`);

      const dMetaTable = stripIdsAndBbox(d.metadata?.table || d.metadata?.tables);
      const pMetaTable = stripIdsAndBbox(p.metadata?.table || p.metadata?.tables);
      if (JSON.stringify(dMetaTable) !== JSON.stringify(pMetaTable)) {
        diffs.push(`Table metadata mismatch:\n  DOCX: ${JSON.stringify(dMetaTable)}\n  PDF:  ${JSON.stringify(pMetaTable)}`);
      }

      const dMetaCode = stripIdsAndBbox(d.metadata?.code || d.metadata?.codeBlocks);
      const pMetaCode = stripIdsAndBbox(p.metadata?.code || p.metadata?.codeBlocks);
      if (JSON.stringify(dMetaCode) !== JSON.stringify(pMetaCode)) {
        diffs.push(`Code metadata mismatch:\n  DOCX: ${JSON.stringify(dMetaCode)}\n  PDF:  ${JSON.stringify(pMetaCode)}`);
      }

      const dMetaEq = stripIdsAndBbox(d.metadata?.equations || d.metadata?.formulas);
      const pMetaEq = stripIdsAndBbox(p.metadata?.equations || p.metadata?.formulas);
      if (JSON.stringify(dMetaEq) !== JSON.stringify(pMetaEq)) {
        diffs.push(`Eq metadata mismatch:\n  DOCX: ${JSON.stringify(dMetaEq)}\n  PDF:  ${JSON.stringify(pMetaEq)}`);
      }

      const dMetaMedia = stripIdsAndBbox(d.metadata?.mediaUrl || d.metadata?.images);
      const pMetaMedia = stripIdsAndBbox(p.metadata?.mediaUrl || p.metadata?.images);
      if (JSON.stringify(dMetaMedia) !== JSON.stringify(pMetaMedia)) {
        diffs.push(`Media metadata mismatch:\n  DOCX: ${JSON.stringify(dMetaMedia)}\n  PDF:  ${JSON.stringify(pMetaMedia)}`);
      }

      const dMetaPassage = stripIdsAndBbox(d.metadata?.passage);
      const pMetaPassage = stripIdsAndBbox(p.metadata?.passage);
      if (JSON.stringify(dMetaPassage) !== JSON.stringify(pMetaPassage)) {
        diffs.push(`Passage metadata mismatch:\n  DOCX: ${JSON.stringify(dMetaPassage)}\n  PDF:  ${JSON.stringify(pMetaPassage)}`);
      }
    }

    report.push({
      index: i + 1,
      hasDiff: diffs.length > 0,
      diffs,
      docxSummary: d ? { type: d.type, text: d.text.slice(0, 50) } : null,
      pdfSummary: p ? { type: p.type, text: p.text.slice(0, 50) } : null
    });
  }

  fs.writeFileSync('scripts/diff_report.json', JSON.stringify(report, null, 2));
  console.log(`Saved report with ${report.filter(r => r.hasDiff).length} / ${report.length} questions having differences.`);
}

main().catch(console.error);
