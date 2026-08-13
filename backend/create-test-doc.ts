import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { writeFileSync } from 'fs';

async function createTestDocument() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Title
        new Paragraph({
          children: [new TextRun({ text: "Word Import Test Suite", bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 }
        }),

        // Section 1: Multiple Choice
        new Paragraph({ children: [new TextRun({ text: "Section 1: Multiple Choice", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Difficulty: Easy", spacing: { after: 100 } }),
        new Paragraph({ text: "Marks: 2", spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Question 1", bold: true })], spacing: { after: 100 } }),
        new Paragraph({ text: "Which planet is known as the Red Planet?", spacing: { after: 200 } }),
        new Paragraph({ text: "A. Earth", spacing: { after: 50 } }),
        new Paragraph({ text: "B. Mars ✅", spacing: { after: 50 } }),
        new Paragraph({ text: "C. Jupiter", spacing: { after: 50 } }),
        new Paragraph({ text: "D. Venus", spacing: { after: 200 } }),
        new Paragraph({ text: "Correct Answer: B", spacing: { after: 100 } }),
        new Paragraph({ text: "Explanation: Mars is called the Red Planet due to iron oxide on its surface.", spacing: { after: 400 } }),

        // Section 2: Multiple Select
        new Paragraph({ children: [new TextRun({ text: "Section 2: Multiple Select", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Difficulty: Medium", spacing: { after: 100 } }),
        new Paragraph({ text: "Marks: 3", spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Question 2", bold: true })], spacing: { after: 100 } }),
        new Paragraph({ text: "Which of the following are programming languages?", spacing: { after: 200 } }),
        new Paragraph({ text: "☐ HTML", spacing: { after: 50 } }),
        new Paragraph({ text: "☑ Python", spacing: { after: 50 } }),
        new Paragraph({ text: "☑ Java", spacing: { after: 50 } }),
        new Paragraph({ text: "☑ C++", spacing: { after: 200 } }),
        new Paragraph({ text: "Correct Answers: Python, Java, C++", spacing: { after: 400 } }),

        // Section 3: True / False
        new Paragraph({ children: [new TextRun({ text: "Section 3: True / False", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Question 3", bold: true })], spacing: { after: 100 } }),
        new Paragraph({ text: "The Earth revolves around the Sun.", spacing: { after: 200 } }),
        new Paragraph({ text: "☑ True", spacing: { after: 50 } }),
        new Paragraph({ text: "☐ False", spacing: { after: 400 } }),

        // Section 4: Short Answer
        new Paragraph({ children: [new TextRun({ text: "Section 4: Short Answer", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Question 4", bold: true })], spacing: { after: 100 } }),
        new Paragraph({ text: "Who invented the World Wide Web?", spacing: { after: 200 } }),
        new Paragraph({ text: "Answer:", spacing: { after: 100 } }),
        new Paragraph({ text: "Tim Berners-Lee", spacing: { after: 400 } }),

        // Section 5: Long Answer
        new Paragraph({ children: [new TextRun({ text: "Section 5: Long Answer", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Question 5", bold: true })], spacing: { after: 100 } }),
        new Paragraph({ text: "Explain the differences between Artificial Intelligence, Machine Learning, and Deep Learning.", spacing: { after: 400 } }),

        // Section 6: Fill in the Blank
        new Paragraph({ children: [new TextRun({ text: "Section 6: Fill in the Blank", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Question 6", bold: true })], spacing: { after: 100 } }),
        new Paragraph({ text: "The capital city of France is __________.", spacing: { after: 200 } }),
        new Paragraph({ text: "Correct Answer:", spacing: { after: 100 } }),
        new Paragraph({ text: "Paris", spacing: { after: 400 } }),

        // Section 7: Table
        new Paragraph({ children: [new TextRun({ text: "Section 7: Table", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Language", bold: true })] })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Creator", bold: true })] })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Year", bold: true })] })], width: { size: 34, type: WidthType.PERCENTAGE } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Python" })] }),
                new TableCell({ children: [new Paragraph({ text: "Guido van Rossum" })] }),
                new TableCell({ children: [new Paragraph({ text: "1991" })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Java" })] }),
                new TableCell({ children: [new Paragraph({ text: "James Gosling" })] }),
                new TableCell({ children: [new Paragraph({ text: "1995" })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Go" })] }),
                new TableCell({ children: [new Paragraph({ text: "Robert Griesemer" })] }),
                new TableCell({ children: [new Paragraph({ text: "2009" })] }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Which language was released first?", spacing: { after: 200 } }),
        new Paragraph({ text: "A. Go", spacing: { after: 50 } }),
        new Paragraph({ text: "B. Java", spacing: { after: 50 } }),
        new Paragraph({ text: "C. Python ✅", spacing: { after: 400 } }),

        // Section 8: Code Block
        new Paragraph({ children: [new TextRun({ text: "Section 8: Code Block", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({
              text: "def factorial(n):\n    if n == 0:\n        return 1\n    return n * factorial(n - 1)",
              font: "Consolas",
              size: 20,
            }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "What does the function return for factorial(5)?", spacing: { after: 200 } }),
        new Paragraph({ text: "A. 100", spacing: { after: 50 } }),
        new Paragraph({ text: "B. 120 ✅", spacing: { after: 50 } }),
        new Paragraph({ text: "C. 24", spacing: { after: 50 } }),
        new Paragraph({ text: "D. 60", spacing: { after: 400 } }),

        // Section 9: Equation
        new Paragraph({ children: [new TextRun({ text: "Section 9: Equation", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Insert this using Word Equation Editor:", spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: "E = mc²", italics: true })], spacing: { after: 200 } }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Who proposed this equation?", spacing: { after: 200 } }),
        new Paragraph({ text: "A. Newton", spacing: { after: 50 } }),
        new Paragraph({ text: "B. Einstein ✅", spacing: { after: 50 } }),
        new Paragraph({ text: "C. Tesla", spacing: { after: 50 } }),
        new Paragraph({ text: "D. Maxwell", spacing: { after: 200 } }),
        new Paragraph({ text: "Insert another equation:", spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: "a² + b² = c²", italics: true })], spacing: { after: 200 } }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "This theorem is known as:", spacing: { after: 200 } }),
        new Paragraph({ text: "A. Binomial Theorem", spacing: { after: 50 } }),
        new Paragraph({ text: "B. Pythagorean Theorem ✅", spacing: { after: 50 } }),
        new Paragraph({ text: "C. Euler's Formula", spacing: { after: 400 } }),

        // Section 10: Bulleted List
        new Paragraph({ children: [new TextRun({ text: "Section 10: Bulleted List", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Which are operating systems?", spacing: { after: 200 } }),
        new Paragraph({ text: "• Windows", spacing: { after: 50 } }),
        new Paragraph({ text: "• Linux", spacing: { after: 50 } }),
        new Paragraph({ text: "• macOS", spacing: { after: 50 } }),
        new Paragraph({ text: "• Chrome", spacing: { after: 200 } }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Select desktop operating systems.", spacing: { after: 400 } }),

        // Section 11: Numbered List
        new Paragraph({ children: [new TextRun({ text: "Section 11: Numbered List", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "1. Requirements", spacing: { after: 50 } }),
        new Paragraph({ text: "2. Design", spacing: { after: 50 } }),
        new Paragraph({ text: "3. Development", spacing: { after: 50 } }),
        new Paragraph({ text: "4. Testing", spacing: { after: 50 } }),
        new Paragraph({ text: "5. Deployment", spacing: { after: 200 } }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Which phase comes immediately after Design?", spacing: { after: 200 } }),
        new Paragraph({ text: "A. Testing", spacing: { after: 50 } }),
        new Paragraph({ text: "B. Development ✅", spacing: { after: 50 } }),
        new Paragraph({ text: "C. Deployment", spacing: { after: 400 } }),

        // Section 12: Image placeholder
        new Paragraph({ children: [new TextRun({ text: "Section 12: Image", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Question:", spacing: { after: 200 } }),
        new Paragraph({ text: "[IMAGE PLACEHOLDER]", spacing: { after: 200 } }),
        new Paragraph({ text: "Identify the object shown in the image.", spacing: { after: 200 } }),
        new Paragraph({ text: "A. Cat", spacing: { after: 50 } }),
        new Paragraph({ text: "B. Dog", spacing: { after: 50 } }),
        new Paragraph({ text: "C. Car", spacing: { after: 50 } }),
        new Paragraph({ text: "D. Tree", spacing: { after: 400 } }),

        // Section 13: Hyperlink
        new Paragraph({ children: [new TextRun({ text: "Section 13: Hyperlink", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Insert hyperlink:", spacing: { after: 100 } }),
        new Paragraph({ text: "https://www.python.org", spacing: { after: 200 } }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Which programming language does this website represent?", spacing: { after: 400 } }),

        // Section 14: Bold / Italic / Underline
        new Paragraph({ children: [new TextRun({ text: "Section 14: Bold / Italic / Underline", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: "Important", bold: true }),
            new TextRun({ text: " " }),
            new TextRun({ text: "Machine Learning", italics: true }),
            new TextRun({ text: " " }),
            new TextRun({ text: "Deep Learning", underline: {} }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Which term is a subset of AI?", spacing: { after: 200 } }),
        new Paragraph({ text: "A. Machine Learning ✅", spacing: { after: 50 } }),
        new Paragraph({ text: "B. Operating System", spacing: { after: 400 } }),

        // Section 15: Mixed Formatting
        new Paragraph({ children: [new TextRun({ text: "Section 15: Mixed Formatting", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "This paragraph contains:", spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: "Bold", bold: true })], spacing: { after: 50 } }),
        new Paragraph({ children: [new TextRun({ text: "Italic", italics: true })], spacing: { after: 50 } }),
        new Paragraph({ children: [new TextRun({ text: "Underline", underline: {} })], spacing: { after: 50 } }),
        new Paragraph({ text: "Colored Text", spacing: { after: 50 } }),
        new Paragraph({ text: "Highlighted Text", spacing: { after: 200 } }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Verify formatting preservation.", spacing: { after: 400 } }),

        // Section 16: Nested List
        new Paragraph({ children: [new TextRun({ text: "Section 16: Nested List", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Programming Languages", spacing: { after: 100 } }),
        new Paragraph({ text: "• Compiled", spacing: { after: 50 } }),
        new Paragraph({ text: "  ○ C", spacing: { after: 50 } }),
        new Paragraph({ text: "  ○ C++", spacing: { after: 50 } }),
        new Paragraph({ text: "• Interpreted", spacing: { after: 50 } }),
        new Paragraph({ text: "  ○ Python", spacing: { after: 50 } }),
        new Paragraph({ text: "  ○ JavaScript", spacing: { after: 200 } }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Which language is interpreted?", spacing: { after: 200 } }),
        new Paragraph({ text: "A. Python ✅", spacing: { after: 50 } }),
        new Paragraph({ text: "B. C", spacing: { after: 400 } }),

        // Section 17: Large Paragraph
        new Paragraph({ children: [new TextRun({ text: "Section 17: Large Paragraph", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Paste 3–5 paragraphs of random text (Lorem Ipsum or an article).", spacing: { after: 100 } }),
        new Paragraph({ text: "Then ask one MCQ based on it.", spacing: { after: 100 } }),
        new Paragraph({ text: "This tests long context extraction.", spacing: { after: 400 } }),

        // Section 18: Multiple Images
        new Paragraph({ children: [new TextRun({ text: "Section 18: Multiple Images", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Insert 2–3 images.", spacing: { after: 100 } }),
        new Paragraph({ text: "Add captions.", spacing: { after: 100 } }),
        new Paragraph({ text: "Question:", spacing: { after: 100 } }),
        new Paragraph({ text: "Match the image with the correct description.", spacing: { after: 400 } }),

        // Section 19: Page Break
        new Paragraph({ children: [new TextRun({ text: "Section 19: Page Break", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Insert a Page Break.", spacing: { after: 100 } }),
        new Paragraph({ text: "Continue with questions.", spacing: { after: 100 } }),
        new Paragraph({ text: "Verify question ordering after import.", spacing: { after: 400 } }),

        // Section 20: Footer/Header
        new Paragraph({ children: [new TextRun({ text: "Section 20: Footer/Header", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Header:", spacing: { after: 100 } }),
        new Paragraph({ text: "Word Import Test", spacing: { after: 100 } }),
        new Paragraph({ text: "Footer:", spacing: { after: 100 } }),
        new Paragraph({ text: "Page 1", spacing: { after: 100 } }),
        new Paragraph({ text: "Verify these are ignored during import.", spacing: { after: 400 } }),

        // Section 21: Final Question
        new Paragraph({ children: [new TextRun({ text: "Section 21: Final Question", bold: true })], heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        new Paragraph({ text: "Which importer are you testing?", spacing: { after: 200 } }),
        new Paragraph({ text: "A. PDF", spacing: { after: 50 } }),
        new Paragraph({ text: "B. DOCX ✅", spacing: { after: 50 } }),
        new Paragraph({ text: "C. Moodle", spacing: { after: 50 } }),
        new Paragraph({ text: "D. OCR", spacing: { after: 400 } }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  writeFileSync('./word-import-test.docx', buffer);
  console.log('Test document created: word-import-test.docx');
}

createTestDocument().catch(console.error);
