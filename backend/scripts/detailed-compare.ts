import fs from 'fs';
import { DocumentIntelligenceAdapter } from '../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';

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

  console.log('--- DOCX DRAFTS FULL JSON ---');
  docxDrafts.forEach((d, i) => {
    console.log(`\n=== DOCX DRAFT #${i + 1} (${d.type}) ===`);
    console.log(JSON.stringify({
      text: d.text,
      type: d.type,
      options: d.options,
      metadata: {
        table: d.metadata?.table,
        code: d.metadata?.code,
        codeBlocks: d.metadata?.codeBlocks,
        equations: d.metadata?.equations,
        mediaUrl: d.metadata?.mediaUrl,
        media: d.metadata?.media,
        diagram: d.metadata?.diagram,
        images: d.metadata?.images,
        passage: d.metadata?.passage,
      }
    }, null, 2));
  });

  console.log('\n\n======================================================\n\n');

  console.log('--- PDF DRAFTS FULL JSON ---');
  pdfDrafts.forEach((p, i) => {
    console.log(`\n=== PDF DRAFT #${i + 1} (${p.type}) ===`);
    console.log(JSON.stringify({
      text: p.text,
      type: p.type,
      options: p.options,
      metadata: {
        table: p.metadata?.table,
        code: p.metadata?.code,
        codeBlocks: p.metadata?.codeBlocks,
        equations: p.metadata?.equations,
        mediaUrl: p.metadata?.mediaUrl,
        media: p.metadata?.media,
        diagram: p.metadata?.diagram,
        images: p.metadata?.images,
        passage: p.metadata?.passage,
      }
    }, null, 2));
  });
}

main().catch(console.error);
