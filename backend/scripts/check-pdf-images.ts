import fs from 'fs';
import { PdfParser } from '../src/services/assessmentStudio/import/parsers/PdfParser.ts';

async function main() {
  const buf = fs.readFileSync('C:/Users/texta/Downloads/Word Import Test Suite.pdf');
  const res = await PdfParser.extract(buf);
  console.log('PDF Extracted Images:', {
    count: res.images.length,
    images: res.images.map(i => ({ id: i.id, mimeType: i.mimeType, dataUrlLen: i.dataUrl?.length, bufLen: i.buffer?.length }))
  });
}

main().catch(console.error);
