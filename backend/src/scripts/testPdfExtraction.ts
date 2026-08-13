import fs from 'fs';
import path from 'path';
import { VisionUnderstanding } from '../services/assessmentStudio/import/documentIntelligence/VisionUnderstanding.js';
import { DocumentGraphConstructor } from '../services/assessmentStudio/import/documentIntelligence/DocumentGraphConstructor.js';
import { EducationalGraphBuilder } from '../services/assessmentStudio/import/documentIntelligence/EducationalGraphBuilder.js';
import { QuestionObjectAssembler } from '../services/assessmentStudio/import/documentIntelligence/agents/QuestionObjectAssembler.js';
import { WorkingMemorySystem } from '../services/assessmentStudio/import/documentIntelligence/WorkingMemory.js';

async function main() {
  const downloadsPath = 'C:\\Users\\texta\\Downloads\\Word Import Test Suite.pdf';
  let pdfPath = downloadsPath;
  if (!fs.existsSync(pdfPath)) {
    console.log('PDF file not found in Downloads, looking in backend...');
    pdfPath = path.resolve(process.cwd(), 'Word Import Test Suite.pdf');
  }

  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file does not exist at:', pdfPath);
    return;
  }

  console.log('Reading PDF file:', pdfPath);
  const buffer = fs.readFileSync(pdfPath);
  const fileObj = {
    buffer,
    name: path.basename(pdfPath),
    mimeType: 'application/pdf'
  };

  console.log('\n--- Stage 1: VisionUnderstanding ---');
  const visionOutput = await VisionUnderstanding.process(fileObj);
  console.log('Total Regions:', visionOutput.regions.length);
  visionOutput.regions.forEach((r, i) => {
    console.log(`Region ${i + 1} (${r.type}): "${r.content?.substring(0, 80)}..."`);
  });

  console.log('\n--- Stage 2: DocumentGraph ---');
  const docGraph = DocumentGraphConstructor.build(visionOutput);
  DocumentGraphConstructor.enhanceWithSemantics(docGraph);
  console.log('DocumentGraph Nodes:', docGraph.nodes.length);
  docGraph.nodes.forEach((n, i) => {
    console.log(`Node ${i + 1} (${n.type}): "${n.content?.substring(0, 80)}..."`);
  });

  console.log('\n--- Stage 3: QuestionObjectAssembler ---');
  const memorySystem = new WorkingMemorySystem();
  const assembler = new QuestionObjectAssembler(docGraph, memorySystem.getMemory());
  const assembleRes = await assembler.assembleQuestions();
  const questions = assembleRes.questions || [];

  console.log('Extracted Questions Count:', questions.length);
  questions.forEach((q, i) => {
    console.log(`\nQuestion ${i + 1} (${q.type}): "${q.statement}"`);
    console.log('Options:', q.options?.map(o => `${o.marker}: ${o.text} (${o.isCorrect ? 'CORRECT' : 'incorrect'})`).join(' | '));
  });
}

main().catch(console.error);
