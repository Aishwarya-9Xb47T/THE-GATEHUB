import fs from 'fs';
import { DocumentIntelligenceAdapter } from '../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';

async function printQ13Draft() {
  // Mute logger logs
  const origLog = console.log;
  console.log = () => {};

  const fileBuf = fs.readFileSync('C:\\Users\\texta\\Downloads\\Word Import Test Suite.docx');
  const fileObj = {
    buffer: fileBuf,
    name: 'Word Import Test Suite.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  const drafts = await DocumentIntelligenceAdapter.extract(fileObj);
  const q13Draft = drafts.find(d => (d.stem || (d as any).text || '').toLowerCase().includes('identify the object'));

  console.log = origLog;

  console.log('=== EXACT EXTRACTED QUESTION DRAFT FOR QUESTION 13 ===');
  console.log(JSON.stringify(q13Draft, null, 2));
}

printQ13Draft().catch(console.error);
