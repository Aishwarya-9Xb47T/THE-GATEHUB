import fs from 'fs';
import path from 'path';
import { DocxParser } from '../services/assessmentStudio/import/parsers/DocxParser.js';
import { VisionUnderstanding } from '../services/assessmentStudio/import/documentIntelligence/VisionUnderstanding.js';
import { DocumentGraphConstructor } from '../services/assessmentStudio/import/documentIntelligence/DocumentGraphConstructor.js';
import { EducationalGraphBuilder } from '../services/assessmentStudio/import/documentIntelligence/EducationalGraphBuilder.js';
import { QuestionObjectAssembler } from '../services/assessmentStudio/import/documentIntelligence/agents/QuestionObjectAssembler.js';
import { WorkingMemorySystem } from '../services/assessmentStudio/import/documentIntelligence/WorkingMemory.js';
import { DocumentIntelligenceAdapter } from '../services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';
import { ValidationEngine } from '../services/assessmentStudio/import/extractors/ValidationEngine.js';
import { QuizConverter } from '../services/assessmentStudio/import/extractors/QuizConverter.js';

async function main() {
  const docxPath = 'C:\\Users\\texta\\Downloads\\Word Import Test Suite.docx';
  const buffer = fs.readFileSync(docxPath);
  const fileObj = {
    buffer,
    name: 'Word Import Test Suite.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };

  const visionOutput = await VisionUnderstanding.process(fileObj);
  const docGraph = DocumentGraphConstructor.build(visionOutput);
  DocumentGraphConstructor.enhanceWithSemantics(docGraph);

  const memorySystem = new WorkingMemorySystem();
  const assembler = new QuestionObjectAssembler(docGraph, memorySystem.getMemory());
  const assembleRes = await assembler.assembleQuestions();
  const questionObjects = assembleRes.questions || [];

  const drafts = (DocumentIntelligenceAdapter as any).convertToExtractedQuestionDraft(questionObjects);
  const validatedResult = ValidationEngine.validate(drafts);
  const validatedQuestions = validatedResult.questions;
  const quiz = QuizConverter.convert(validatedQuestions, { title: 'Test Quiz' });

  const targetIndices = [6, 7, 8, 9]; // Q7 (Table), Q8 (Code), Q9 (Formula 1), Q10 (Formula 2)

  console.log('\n========================================================================');
  console.log('COMPLETE PIPELINE TRACE FOR TARGET QUESTIONS (Q7, Q8, Q9, Q10)');
  console.log('========================================================================\n');

  for (const idx of targetIndices) {
    const qObj = questionObjects[idx];
    const draft = drafts[idx];
    const ghQuestion = quiz.questions[idx];

    console.log(`\n========================================================================`);
    console.log(`QUESTION ${idx + 1}: "${qObj?.statement || ghQuestion?.text}"`);
    console.log(`========================================================================`);
    
    console.log('\n--- 1. QuestionObject (QuestionBuilderAgent) ---');
    console.log(JSON.stringify({
      id: qObj?.id,
      statement: qObj?.statement,
      type: qObj?.type,
      table: qObj?.table,
      code: qObj?.code,
      formulas: qObj?.formulas,
      equations: qObj?.equations
    }, null, 2));

    console.log('\n--- 2. ExtractedQuestionDraft (DocumentIntelligenceAdapter) ---');
    console.log(JSON.stringify({
      id: draft?.id,
      text: draft?.text,
      type: draft?.type,
      metadataTable: draft?.metadata?.table,
      metadataCode: draft?.metadata?.code,
      metadataFormulas: draft?.metadata?.formulas,
      metadataEquations: draft?.metadata?.equations
    }, null, 2));

    console.log('\n--- 3. GateHubQuestion / React Props (QuizConverter) ---');
    console.log(JSON.stringify({
      id: ghQuestion?.id,
      text: ghQuestion?.text,
      type: ghQuestion?.type,
      table: ghQuestion?.table,
      code: ghQuestion?.code,
      formulas: ghQuestion?.formulas,
      equations: ghQuestion?.equations,
      metadata: {
        table: ghQuestion?.metadata?.table,
        code: ghQuestion?.metadata?.code,
        formulas: ghQuestion?.metadata?.formulas,
        equations: ghQuestion?.metadata?.equations
      }
    }, null, 2));
  }
}

main().catch(console.error);
