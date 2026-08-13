import fs from 'fs';
import path from 'path';
import { DocxParser } from '../services/assessmentStudio/import/parsers/DocxParser.js';
import { VisionUnderstanding } from '../services/assessmentStudio/import/documentIntelligence/VisionUnderstanding.js';
import { DocumentGraphConstructor } from '../services/assessmentStudio/import/documentIntelligence/DocumentGraphConstructor.js';
import { EducationalGraphBuilder } from '../services/assessmentStudio/import/documentIntelligence/EducationalGraphBuilder.js';
import { SemanticReconstructor } from '../services/assessmentStudio/import/documentIntelligence/SemanticReconstructor.js';
import { MetadataPreserver } from '../services/assessmentStudio/import/documentIntelligence/MetadataPreserver.js';
import { DocumentIntelligenceAdapter } from '../services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';
import { ValidationEngine } from '../services/assessmentStudio/import/extractors/ValidationEngine.js';
import { QuizConverter } from '../services/assessmentStudio/import/extractors/QuizConverter.js';

async function traceDocumentPipeline() {
  const filePath = 'C:\\Users\\texta\\Downloads\\Word Import Test Suite.docx';
  console.log(`\n========================================================================`);
  console.log(`VERIFYING STRUCTURED QUESTION CONTAINER OBJECT SEPARATION`);
  console.log(`FILE: ${filePath}`);
  console.log(`========================================================================\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found at ${filePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const fileObj = {
    buffer,
    name: 'Word Import Test Suite.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  const extractedDrafts = await DocumentIntelligenceAdapter.extract(fileObj);
  const validationResult = ValidationEngine.validate(extractedDrafts);

  console.log(`\n========================================================================`);
  console.log(`STRUCTURED QUESTION CONTAINER OBJECT SEPARATION AUDIT`);
  console.log(`========================================================================\n`);

  extractedDrafts.forEach((q, idx) => {
    const meta = (q.metadata as any) || {};
    const text = q.text || '';

    const hasHtmlBlobs = /<table|<pre|<code|<img|\$\$/i.test(text);

    console.log(`Question ${idx + 1}:`);
    console.log(`  prompt (text)       : "${text.substring(0, 80).replace(/\n/g, ' ')}"`);
    console.log(`  containsHtmlBlobs  : ${hasHtmlBlobs ? 'YES (FAIL)' : 'NO (CLEAN PROMPT ✓)'}`);
    console.log(`  table attachment   : ${meta.table || meta.tables ? JSON.stringify(meta.table || meta.tables).substring(0, 100) : 'none'}`);
    console.log(`  code attachment    : ${meta.code || meta.codeBlocks ? JSON.stringify(meta.code || meta.codeBlocks).substring(0, 100) : 'none'}`);
    console.log(`  formula attachment : ${meta.formulas || meta.equations ? JSON.stringify(meta.formulas || meta.equations).substring(0, 100) : 'none'}`);
    console.log(`  image attachment   : ${meta.images || meta.diagram ? JSON.stringify(meta.images || meta.diagram).substring(0, 100) : 'none'}`);
    console.log(`------------------------------------------------------------------------`);
  });

  const quiz = QuizConverter.convert(validationResult.questions, { title: 'Word Import Test Suite' });
  console.log(`\n========================================================================`);
  console.log(`FINAL CONVERTED QUIZ BUILDER RESULT`);
  console.log(`Total Reconstructed Quiz Questions: ${quiz.questions.length}`);
  console.log(`Sample Equation Question Object (Question 10) JSON:`);
  const theoremQ = quiz.questions.find(q => q.text.includes("theorem") || (q.metadata as any)?.formulas?.includes("a² + b² = c²"));
  console.log(JSON.stringify(theoremQ || quiz.questions[9], null, 2));
  console.log(`========================================================================\n`);
}

traceDocumentPipeline().catch(console.error);
