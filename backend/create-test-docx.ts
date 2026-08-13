/**
 * Create valid DOCX test file with quiz questions containing rich content
 * Simplified to 2 questions with immediate rich content for testing association
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType } from 'docx';
import fs from 'fs';

async function createTestDocx() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Title
        new Paragraph({
          text: 'Word Import Test Suite',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
        }),

        // Question 1 with Table
        new Paragraph({ text: 'Question 1', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: 'Which language was released first?' }),
        new Paragraph({ text: 'A. Go' }),
        new Paragraph({ text: 'B. Java' }),
        new Paragraph({ children: [new TextRun({ text: 'C. Python', bold: true })] }),
        new Paragraph({ text: '' }),
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Language')] }),
                new TableCell({ children: [new Paragraph('Creator')] }),
                new TableCell({ children: [new Paragraph('Year')] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Python')] }),
                new TableCell({ children: [new Paragraph('Guido van Rossum')] }),
                new TableCell({ children: [new Paragraph('1991')] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Java')] }),
                new TableCell({ children: [new Paragraph('James Gosling')] }),
                new TableCell({ children: [new Paragraph('1995')] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Go')] }),
                new TableCell({ children: [new Paragraph('Robert Griesemer')] }),
                new TableCell({ children: [new Paragraph('2009')] }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
        new Paragraph({ text: '' }),

        // Question 2 with Code Block
        new Paragraph({ text: 'Question 2', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: 'What does the function return for factorial(5)?' }),
        new Paragraph({ text: 'A. 100' }),
        new Paragraph({ children: [new TextRun({ text: 'B. 120', bold: true })] }),
        new Paragraph({ text: 'C. 24' }),
        new Paragraph({ text: 'D. 60' }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'def factorial(n):\n    if n == 0:\n        return 1\n    return n * factorial(n - 1)',
              font: 'Courier New',
            }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'Explanation: The factorial function calculates the product of all positive integers up to n.' }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'Calculation: 5! = 5 × 4 × 3 × 2 × 1 = 120' }),
        new Paragraph({ text: '' }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('f:\\Learning Website (3)\\Learning Website\\backend\\test-rich-content.docx', buffer);
  console.log('Test DOCX created: test-rich-content.docx');
  console.log('File size:', buffer.length, 'bytes');
}

createTestDocx().catch(console.error);
