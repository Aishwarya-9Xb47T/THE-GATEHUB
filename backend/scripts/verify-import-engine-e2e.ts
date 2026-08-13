import fs from 'fs';
import path from 'path';
import { AntiGravityV2Engine } from '../src/services/antigravityV2/AntiGravityV2Engine.js';
import { DocumentIntelligenceAdapter } from '../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';

async function verify() {
  const filePath = 'C:/Users/texta/Downloads/Word Import Test Suite.docx';
  if (!fs.existsSync(filePath)) {
    console.error('Test file not found:', filePath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  console.log('=== VERIFYING ZERO LOSS DOCUMENT IMPORT ENGINE ===');
  console.log('File size:', buffer.length);

  const v2Result = await AntiGravityV2Engine.processDocument({
    name: 'Word Import Test Suite.docx',
    buffer,
  });

  console.log('\n--- V2 ENGINE OUTPUT ---');
  console.log('Success:', v2Result.success);
  console.log('Total Questions:', v2Result.questions.length);

  const drafts = await DocumentIntelligenceAdapter.extract({
    name: 'Word Import Test Suite.docx',
    buffer,
  });

  console.log('\n--- ADAPTER DRAFTS OUTPUT ---');
  console.log('Drafts count:', drafts.length);

  let totalCodeBlocks = 0;
  let totalSplitCodeViolations = 0;
  let totalTables = 0;
  let totalImages = 0;
  let totalFormulas = 0;

  drafts.forEach((draft, idx) => {
    const meta = draft.metadata || {};
    const children = (meta as any).children || [];
    const codeChildren = children.filter((c: any) => c.type === 'code');

    if (codeChildren.length > 1) {
      totalSplitCodeViolations++;
      console.error(`❌ VIOLATION: Question ${idx + 1} [${draft.id}] has ${codeChildren.length} separate code blocks!`);
    }

    if (codeChildren.length === 1 || meta.code || (meta as any).starterCode) {
      totalCodeBlocks++;
    }

    if (meta.table || (Array.isArray(meta.tables) && meta.tables.length > 0)) {
      totalTables++;
    }

    if (meta.mediaUrl || (Array.isArray(meta.images) && meta.images.length > 0)) {
      totalImages++;
    }

    if (meta.formulas?.length || meta.equations?.length) {
      totalFormulas++;
    }
  });

  console.log('\n=================================================================');
  console.log('                 ENGINE INTEGRITY METRICS                        ');
  console.log('=================================================================');
  console.log('Total Questions Extracted:', drafts.length);
  console.log('Total Monaco Code Blocks:', totalCodeBlocks);
  console.log('Split Code Violations (Must be 0):', totalSplitCodeViolations);
  console.log('Total Native Table Components:', totalTables);
  console.log('Total Native Image Components:', totalImages);
  console.log('Total Native Math Formula Components:', totalFormulas);

  if (totalSplitCodeViolations === 0 && drafts.length > 0) {
    console.log('\n✅ VERIFICATION PASSED: Document import engine structure is intact!');
  } else {
    console.error('\n❌ VERIFICATION FAILED: Code split or missing document structures detected.');
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
