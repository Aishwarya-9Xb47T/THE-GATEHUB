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

  console.log(`DOCX Draft Count: ${docxDrafts.length}`);
  console.log(`PDF Draft Count:  ${pdfDrafts.length}\n`);

  for (let i = 0; i < Math.max(docxDrafts.length, pdfDrafts.length); i++) {
    const d = docxDrafts[i];
    const p = pdfDrafts[i];

    console.log(`========================================`);
    console.log(`INDEX #${i + 1}`);
    console.log(`========================================`);
    console.log(`[DOCX] Type: ${d?.type || 'MISSING'}`);
    console.log(`[DOCX] Text:\n${d?.text}`);
    console.log(`[DOCX] Options (${d?.options?.length || 0}): ${d?.options?.map(o => `${o.text} (${o.isCorrect ? 'Correct' : 'Incorrect'})`).join(' | ')}`);
    console.log(`[DOCX] Meta Table: ${JSON.stringify(d?.metadata?.table || d?.metadata?.tables || null)}`);
    console.log(`[DOCX] Meta Code: ${JSON.stringify(d?.metadata?.code || d?.metadata?.codeBlocks || null)}`);
    console.log(`[DOCX] Meta Eq: ${JSON.stringify(d?.metadata?.equations || d?.metadata?.formulas || null)}`);
    console.log(`[DOCX] Meta Image/Media: ${JSON.stringify(d?.metadata?.mediaUrl || d?.metadata?.media || d?.metadata?.diagram || d?.metadata?.images || null)}`);
    console.log(`[DOCX] Meta Passage: ${JSON.stringify(d?.metadata?.passage || d?.metadata?.context || null)}`);

    console.log(`----------------------------------------`);
    console.log(`[PDF ] Type: ${p?.type || 'MISSING'}`);
    console.log(`[PDF ] Text:\n${p?.text}`);
    console.log(`[PDF ] Options (${p?.options?.length || 0}): ${p?.options?.map(o => `${o.text} (${o.isCorrect ? 'Correct' : 'Incorrect'})`).join(' | ')}`);
    console.log(`[PDF ] Meta Table: ${JSON.stringify(p?.metadata?.table || p?.metadata?.tables || null)}`);
    console.log(`[PDF ] Meta Code: ${JSON.stringify(p?.metadata?.code || p?.metadata?.codeBlocks || null)}`);
    console.log(`[PDF ] Meta Eq: ${JSON.stringify(p?.metadata?.equations || p?.metadata?.formulas || null)}`);
    console.log(`[PDF ] Meta Image/Media: ${JSON.stringify(p?.metadata?.mediaUrl || p?.metadata?.media || p?.metadata?.diagram || p?.metadata?.images || null)}`);
    console.log(`[PDF ] Meta Passage: ${JSON.stringify(p?.metadata?.passage || p?.metadata?.context || null)}`);
    console.log('\n');
  }
}

main().catch(console.error);
