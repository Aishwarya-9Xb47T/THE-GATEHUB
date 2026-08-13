import fs from 'fs';
import path from 'path';
import { DocxParser } from '../services/assessmentStudio/import/parsers/DocxParser.js';
import { VisionUnderstanding } from '../services/assessmentStudio/import/documentIntelligence/VisionUnderstanding.js';
import { DocumentGraphConstructor } from '../services/assessmentStudio/import/documentIntelligence/DocumentGraphConstructor.js';

async function main() {
  const docxPath = 'C:\\Users\\texta\\Downloads\\Word Import Test Suite.docx';
  console.log('Reading:', docxPath);
  const buffer = fs.readFileSync(docxPath);
  
  const visionOutput = await VisionUnderstanding.process({
    buffer,
    name: 'Word Import Test Suite.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  console.log('\n--- ALL VISION REGIONS ---');
  visionOutput.regions.forEach((r, idx) => {
    console.log(`[Region ${idx + 1}] (${r.type}): "${r.content.replace(/\n/g, ' ')}"`);
  });

  const graph = DocumentGraphConstructor.build(visionOutput);
  DocumentGraphConstructor.enhanceWithSemantics(graph);
  const questionNodes = graph.getNodesByType('Question');
  
  console.log('\n--- DETECTED QUESTION NODES --- (Total:', questionNodes.length, ')');
  questionNodes.forEach((q, idx) => {
    console.log(`Q${idx + 1}: [${q.id}] "${q.content?.replace(/\n/g, ' ')}"`);
  });
}

main().catch(console.error);
