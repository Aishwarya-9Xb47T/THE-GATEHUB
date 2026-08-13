import fs from 'fs';
import path from 'path';
import { DocumentIntelligenceAdapter } from '../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';

async function main() {
  const docxPath = 'C:/Users/texta/Downloads/Word Import Test Suite.docx';
  const pdfPath = 'C:/Users/texta/Downloads/Word Import Test Suite.pdf';

  if (!fs.existsSync(docxPath) || !fs.existsSync(pdfPath)) {
    console.error('Test files missing!');
    process.exit(1);
  }

  const docxBuf = fs.readFileSync(docxPath);
  const pdfBuf = fs.readFileSync(pdfPath);

  console.log('=== EXTRACTING DOCX DRAFTS ===');
  const docxDrafts = await DocumentIntelligenceAdapter.extract({
    buffer: docxBuf,
    name: 'Word Import Test Suite.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  console.log('\n=== EXTRACTING PDF DRAFTS ===');
  const pdfDrafts = await DocumentIntelligenceAdapter.extract({
    buffer: pdfBuf,
    name: 'Word Import Test Suite.pdf',
    mimeType: 'application/pdf'
  });

  console.log(`\n==================================================`);
  console.log(`SUMMARY OF EXTRACTION:`);
  console.log(`DOCX Draft Count: ${docxDrafts.length}`);
  console.log(`PDF Draft Count:  ${pdfDrafts.length}`);
  console.log(`==================================================\n`);

  const maxLen = Math.max(docxDrafts.length, pdfDrafts.length);

  for (let i = 0; i < maxLen; i++) {
    const d = docxDrafts[i];
    const p = pdfDrafts[i];

    console.log(`--- QUESTION ${i + 1} ---`);
    if (d) {
      console.log(`[DOCX Q${i + 1}] Type: ${d.type} | Stem: "${d.text.substring(0, 80)}..."`);
      console.log(`  Options (${d.options.length}): ${d.options.map(o => o.text).join(' | ')}`);
      console.log(`  Has Table: ${!!(d.metadata?.table || d.metadata?.tables)} | Has Image: ${!!(d.metadata?.mediaUrl || d.metadata?.media || d.metadata?.diagram || d.metadata?.images?.length)} | Has Code: ${!!(d.metadata?.code || d.metadata?.codeBlocks)} | Has Eq: ${!!(d.metadata?.equations || d.metadata?.formulas)} | Passage: ${!!d.metadata?.passage}`);
    } else {
      console.log(`[DOCX Q${i + 1}] MISSING QUESTION`);
    }

    if (p) {
      console.log(`[PDF  Q${i + 1}] Type: ${p.type} | Stem: "${p.text.substring(0, 80)}..."`);
      console.log(`  Options (${p.options.length}): ${p.options.map(o => o.text).join(' | ')}`);
      console.log(`  Has Table: ${!!(p.metadata?.table || p.metadata?.tables)} | Has Image: ${!!(p.metadata?.mediaUrl || p.metadata?.media || p.metadata?.diagram || p.metadata?.images?.length)} | Has Code: ${!!(p.metadata?.code || p.metadata?.codeBlocks)} | Has Eq: ${!!(p.metadata?.equations || p.metadata?.formulas)} | Passage: ${!!p.metadata?.passage}`);
    } else {
      console.log(`[PDF  Q${i + 1}] MISSING QUESTION`);
    }
    console.log('');
  }
}

main().catch(console.error);
