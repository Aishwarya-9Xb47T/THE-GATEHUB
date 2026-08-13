import JSZip from 'jszip';
import { UnifiedExtractionEngine } from '../services/extraction/UnifiedExtractionEngine.js';

// Helper to create valid DOCX Buffer with all 7 targeted educational elements
async function createTestDocxBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  // 1. Content Types
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  // 2. Relationships
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.python.org" TargetMode="External"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/>
</Relationships>`
  );

  // 3. Media images (1x1 PNGs)
  const dummyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  zip.file('word/media/image1.png', dummyPng);
  zip.file('word/media/image2.png', dummyPng);

  // 4. Main Document XML containing Question 7..18 structures
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <!-- Question 7: Table -->
    <w:p><w:r><w:t>Question 7: Analyze the dataset table below.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Header 1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Header 2</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Val A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Val B</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>A. True</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. False</w:t></w:r></w:p>

    <!-- Question 8: Indented Code Block -->
    <w:p><w:r><w:t>Question 8: What is the return value of factorial(3)?</w:t></w:r></w:p>
    <w:p><w:rPr><w:rFonts w:ascii="Consolas"/></w:rPr><w:r><w:t xml:space="preserve">def factorial(n):</w:t></w:r></w:p>
    <w:p><w:rPr><w:rFonts w:ascii="Consolas"/></w:rPr><w:r><w:t xml:space="preserve">    if n == 0:</w:t></w:r></w:p>
    <w:p><w:rPr><w:rFonts w:ascii="Consolas"/></w:rPr><w:r><w:t xml:space="preserve">        return 1</w:t></w:r></w:p>
    <w:p><w:rPr><w:rFonts w:ascii="Consolas"/></w:rPr><w:r><w:t xml:space="preserve">    return n * factorial(n-1)</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. 6</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. 24</w:t></w:r></w:p>

    <!-- Question 9: OMML Equation -->
    <w:p><w:r><w:t>Question 9: Solve for x in the equation below.</w:t></w:r></w:p>
    <m:oMathPara>
      <m:oMath>
        <m:f>
          <m:num><m:r><m:t>a</m:t></m:r></m:num>
          <m:den><m:r><m:t>b</m:t></m:r></m:den>
        </m:f>
        <m:r><m:t>=</m:t></m:r>
        <m:rad>
          <m:e><m:r><m:t>c</m:t></m:r></m:e>
        </m:rad>
      </m:oMath>
    </m:oMathPara>
    <w:p><w:r><w:t>A. x = 1</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. x = 2</w:t></w:r></w:p>

    <!-- Question 12: Image with Caption -->
    <w:p><w:r><w:t>Question 12: Identify the object shown in Figure 1.</w:t></w:r></w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <a:blip r:embed="rId1"/>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p><w:pStyle w:val="Caption"/><w:r><w:t>Figure 1: Test Component Diagram</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. Resistor</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. Capacitor</w:t></w:r></w:p>

    <!-- Question 13: Hyperlink -->
    <w:p><w:r><w:t>Question 13: Refer to the documentation link.</w:t></w:r></w:p>
    <w:p>
      <w:hyperlink r:id="rId2">
        <w:r><w:t>Official Python Docs</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p><w:r><w:t>A. Option 1</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. Option 2</w:t></w:r></w:p>

    <!-- Question 16: Multi-level List -->
    <w:p><w:r><w:t>Question 16: Choose the correct sequence of steps.</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Initialize workspace</w:t></w:r></w:p>
    <w:p><w:r><w:t>2. Run compilation step</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. 1 then 2</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. 2 then 1</w:t></w:r></w:p>

    <!-- Question 18: Multiple Images -->
    <w:p><w:r><w:t>Question 18: Compare Diagram A and Diagram B.</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
    <w:p><w:pStyle w:val="Caption"/><w:r><w:t>Diagram A</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><a:blip r:embed="rId3"/></w:drawing></w:r></w:p>
    <w:p><w:pStyle w:val="Caption"/><w:r><w:t>Diagram B</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. Identical</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. Different</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);
  return await zip.generateAsync({ type: 'nodebuffer' });
}

export async function runPipelineTracerAndRegressionSuite() {
  console.log('=================================================================');
  console.log('       ZERO-LOSS DOCUMENT IMPORT ENGINE: TRACER REPORT          ');
  console.log('=================================================================\n');

  const buffer = await createTestDocxBuffer();
  console.log(`[Tracer] Input DOCX Buffer generated (${buffer.length} bytes)\n`);

  // Stage 1: Pass 1 Semantic Document Tree Construction & Educational Grouping
  const unifiedResult = await UnifiedExtractionEngine.process({
    buffer,
    fileName: 'test_suite.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  console.log('-----------------------------------------------------------------');
  console.log('STAGE 1 & 2: SEMANTIC GRAPH & EDUCATIONAL GROUPING OUTPUT');
  console.log('-----------------------------------------------------------------');
  console.log(`Total Extracted Questions: ${unifiedResult.questions.length}`);
  console.log(`Extracted Media Count: ${unifiedResult.media.length}\n`);

  const targets = [
    { label: 'Question 7 (Table)', qIdx: 0, checkKey: 'table' },
    { label: 'Question 8 (Code)', qIdx: 1, checkKey: 'codeBlock' },
    { label: 'Question 9 (Formula)', qIdx: 2, checkKey: 'mathNode' },
    { label: 'Question 12 (Image)', qIdx: 3, checkKey: 'media' },
    { label: 'Question 13 (Hyperlink)', qIdx: 4, checkKey: 'hyperlinks' },
    { label: 'Question 16 (List)', qIdx: 5, checkKey: 'lists' },
    { label: 'Question 18 (Multiple Images)', qIdx: 6, checkKey: 'media' },
  ];

  let regressionFailed = false;

  targets.forEach((target) => {
    const q = unifiedResult.questions[target.qIdx];
    console.log(`>>> ${target.label} <<<`);
    if (!q) {
      console.error(`  [FAIL] Question index ${target.qIdx} not found!`);
      regressionFailed = true;
      return;
    }

    console.log(`  Stem: "${q.stem}"`);
    console.log(`  Type: ${q.type}`);
    console.log(`  Options Count: ${q.options.length}`);

    if (target.checkKey === 'table') {
      console.log(`  Table Node:`, JSON.stringify(q.table, null, 2));
      if (!q.table) regressionFailed = true;
    } else if (target.checkKey === 'codeBlock') {
      console.log(`  Code Block Content:\n${q.codeBlock?.content}`);
      if (!q.codeBlock || !q.codeBlock.content.includes('def factorial')) regressionFailed = true;
    } else if (target.checkKey === 'mathNode') {
      console.log(`  Math Node Latex: "${q.mathNode?.latex}"`);
      if (!q.mathNode) regressionFailed = true;
    } else if (target.checkKey === 'media') {
      console.log(`  Media Count: ${q.media?.length}`);
      console.log(`  Media DataUrls: ${q.media?.map((m) => m.dataUrl.substring(0, 40) + '...').join(', ')}`);
      if (!q.media || q.media.length === 0) regressionFailed = true;
    } else if (target.checkKey === 'hyperlinks') {
      console.log(`  Hyperlinks:`, JSON.stringify(q.hyperlinks, null, 2));
      if (!q.hyperlinks || q.hyperlinks.length === 0) regressionFailed = true;
    } else if (target.checkKey === 'lists') {
      console.log(`  Lists:`, JSON.stringify(q.lists, null, 2));
      if (!q.lists || q.lists.length === 0) regressionFailed = true;
    }
    console.log('');
  });

  console.log('-----------------------------------------------------------------');
  console.log('STAGE 3: REGRESSION SUITE AUDIT');
  console.log('-----------------------------------------------------------------');
  const totalQuestions = unifiedResult.questions.length;
  const totalCodeBlocks = unifiedResult.questions.filter((q) => q.codeBlock).length;
  const totalTables = unifiedResult.questions.filter((q) => q.table).length;
  const totalFormulas = unifiedResult.questions.filter((q) => q.mathNode).length;
  const totalMedia = unifiedResult.questions.filter((q) => q.media && q.media.length > 0).length;
  const totalHyperlinks = unifiedResult.questions.filter((q) => q.hyperlinks && q.hyperlinks.length > 0).length;
  const totalLists = unifiedResult.questions.filter((q) => q.lists && q.lists.length > 0).length;

  console.log(`✓ Questions: ${totalQuestions} / 7`);
  console.log(`✓ Code Blocks: ${totalCodeBlocks} / 1`);
  console.log(`✓ Tables: ${totalTables} / 1`);
  console.log(`✓ Equations: ${totalFormulas} / 1`);
  console.log(`✓ Media Questions: ${totalMedia} / 2`);
  console.log(`✓ Hyperlink Questions: ${totalHyperlinks} / 1`);
  console.log(`✓ List Questions: ${totalLists} / 1`);

  if (totalQuestions !== 7 || totalCodeBlocks !== 1 || totalTables !== 1 || totalFormulas !== 1 || totalMedia !== 2 || totalHyperlinks !== 1 || totalLists !== 1) {
    regressionFailed = true;
  }

  if (regressionFailed) {
    console.error('\n[REGRESSION SUITE FAIL] Object count discrepancy detected!');
    process.exit(1);
  } else {
    console.log('\n=================================================================');
    console.log('   REGRESSION SUITE PASSED 100% - ZERO-LOSS ENGINE VERIFIED      ');
    console.log('=================================================================\n');
  }
}

// Run tracer script if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('testPipelineTracer')) {
  runPipelineTracerAndRegressionSuite().catch((err) => {
    console.error('[Tracer Error]:', err);
    process.exit(1);
  });
}
