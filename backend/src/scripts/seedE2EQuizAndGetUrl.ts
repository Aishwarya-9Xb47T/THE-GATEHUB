import JSZip from 'jszip';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { JWT_SECRET } from '../config/jwt.js';
import { UnifiedExtractionEngine } from '../services/extraction/UnifiedExtractionEngine.js';
import { materializeQuizFromImportDrafts } from '../services/assessmentStudio/import/importQuizMaterializer.js';

async function createTestDocxBuffer(): Promise<Buffer> {
  const zip = new JSZip();

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

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.python.org" TargetMode="External"/>
</Relationships>`
  );

  const dummyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  zip.file('word/media/image1.png', dummyPng);

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
  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);
  return await zip.generateAsync({ type: 'nodebuffer' });
}

export async function seedAndGetUrl() {
  // 1. Find or create instructor user
  let user = await prisma.user.findFirst({ where: { role: 'instructor' } });
  if (!user) {
    user = await prisma.user.findFirst();
  }
  if (!user) {
    throw new Error('No user found in database');
  }

  // 2. Extract questions from test DOCX
  const buffer = await createTestDocxBuffer();
  const extractionResult = await UnifiedExtractionEngine.process({
    buffer,
    fileName: 'e2e_test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const drafts = extractionResult.questions.map((q: any) => {
    const meta: Record<string, any> = { ...(q.metadata || {}) };
    if (q.codeBlock) {
      meta.code = q.codeBlock;
      meta.starterCode = q.codeBlock.content;
      meta.codeBlocks = [q.codeBlock];
    }
    if (q.table) {
      meta.table = q.table;
      meta.tables = [q.table];
    }
    if (q.mathNode) {
      meta.formulas = [q.mathNode.latex];
      meta.equations = [{ id: q.mathNode.id, latex: q.mathNode.latex, format: 'latex' }];
    }
    if (q.media && q.media.length > 0) {
      meta.images = q.media;
      meta.mediaUrl = q.media[0]?.dataUrl || q.media[0]?.url;
      meta.media = meta.mediaUrl ? { url: meta.mediaUrl, kind: 'image' } : undefined;
    }
    if (q.hyperlinks && q.hyperlinks.length > 0) {
      meta.hyperlinks = q.hyperlinks;
      meta.hyperlink = q.hyperlinks[0];
    }
    if (q.lists && q.lists.length > 0) {
      meta.lists = q.lists;
      meta.list = q.lists[0];
    }

    return {
      stem: q.stem,
      text: q.stem,
      type: q.type,
      options: q.options.map((o: any) => ({ text: o.text, isCorrect: o.isCorrect })),
      explanation: q.explanation || '',
      hint: q.hint || '',
      difficulty: q.difficulty || 'medium',
      bloomLevel: q.bloomLevel || 'L2',
      marks: q.marks || 1,
      negativeMarks: q.negativeMarks || 0,
      metadata: meta,
    };
  });

  const preview = {
    title: 'E2E Imported Document Test Quiz',
    rawQuestionCount: drafts.length,
    extractedQuestionCount: drafts.length,
    confidenceAverage: 0.98,
    questions: drafts,
  };

  // 3. Materialize quiz in database
  const quiz = await materializeQuizFromImportDrafts(user.id, 'E2E Imported Document Test Quiz', drafts as any, preview as any);

  // 4. Generate JWT token
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  const url = `http://localhost:5173/instructor/quiz-room/${quiz.id}?token=${token}`;
  console.log(`\n=================================================================`);
  console.log(`  E2E QUIZ SEEDED SUCCESSFULLY`);
  console.log(`  Quiz ID: ${quiz.id}`);
  console.log(`  Questions Count: ${drafts.length}`);
  console.log(`  Target URL: ${url}`);
  console.log(`=================================================================\n`);
  return { quizId: quiz.id, url, token };
}

seedAndGetUrl().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
