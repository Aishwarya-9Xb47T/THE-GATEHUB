import zlib from 'zlib';

function rgbToBmpDataUrl(width: number, height: number, rgbBuffer: Buffer): string {
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const headerSize = fileHeaderSize + infoHeaderSize;
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = headerSize + pixelArraySize;

  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(headerSize, 10);

  buf.writeUInt32LE(infoHeaderSize, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelArraySize, 34);

  let offset = headerSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      if (srcIdx + 2 < rgbBuffer.length) {
        buf[offset] = rgbBuffer[srcIdx + 2];
        buf[offset + 1] = rgbBuffer[srcIdx + 1];
        buf[offset + 2] = rgbBuffer[srcIdx];
      }
      offset += 3;
    }
    offset += rowSize - width * 3;
  }

  return `data:image/bmp;base64,${buf.toString('base64')}`;
}

function decodeAscii85(str: string): Buffer {
  let clean = str.replace(/\s+/g, '');
  if (clean.startsWith('<~')) clean = clean.slice(2);
  if (clean.endsWith('~>')) clean = clean.slice(0, -2);

  const out: number[] = [];
  let tuple = 0;
  let count = 0;

  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    if (c === 122 && count === 0) { // 'z'
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 33 || c > 117) continue; // '!' to 'u'
    tuple = tuple * 85 + (c - 33);
    count++;
    if (count === 5) {
      out.push((tuple >> 24) & 255, (tuple >> 16) & 255, (tuple >> 8) & 255, tuple & 255);
      tuple = 0;
      count = 0;
    }
  }

  if (count > 0) {
    for (let i = count; i < 5; i++) {
      tuple = tuple * 85 + 84;
    }
    for (let i = 0; i < count - 1; i++) {
      out.push((tuple >> (24 - i * 8)) & 255);
    }
  }

  return Buffer.from(out);
}

export interface ExtractedPdfImage {
  id: string;
  mimeType: string;
  dataUrl: string;
  buffer: Buffer;
  width: number;
  height: number;
}

export function extractPdfImages(buffer: Buffer): ExtractedPdfImage[] {
  const images: ExtractedPdfImage[] = [];
  let pos = 0;
  let imgIndex = 0;

  // 1. Scan for embedded standalone JPEGs
  while (pos < buffer.length - 4) {
    if (buffer[pos] === 0xff && buffer[pos + 1] === 0xd8 && buffer[pos + 2] === 0xff) {
      const start = pos;
      let end = -1;
      for (let j = start + 3; j < buffer.length - 1; j++) {
        if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
          end = j + 2;
          break;
        }
      }
      if (end > start + 100) {
        const jpegBuf = buffer.subarray(start, end);
        imgIndex++;
        images.push({
          id: `pdf_img_${imgIndex}`,
          mimeType: 'image/jpeg',
          dataUrl: `data:image/jpeg;base64,${jpegBuf.toString('base64')}`,
          buffer: jpegBuf,
          width: 600,
          height: 400,
        });
        pos = end;
        continue;
      }
    }

    // 2. Scan for embedded standalone PNGs
    if (buffer[pos] === 0x89 && buffer[pos + 1] === 0x50 && buffer[pos + 2] === 0x4e && buffer[pos + 3] === 0x47) {
      const start = pos;
      const iend = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
      const idx = buffer.indexOf(iend, start);
      if (idx !== -1) {
        const end = idx + iend.length;
        const pngBuf = buffer.subarray(start, end);
        imgIndex++;
        images.push({
          id: `pdf_img_${imgIndex}`,
          mimeType: 'image/png',
          dataUrl: `data:image/png;base64,${pngBuf.toString('base64')}`,
          buffer: pngBuf,
          width: 600,
          height: 400,
        });
        pos = end;
        continue;
      }
    }
    pos++;
  }

  // 3. Scan for PDF XObject Image stream dictionaries
  const pdfStr = buffer.toString('latin1');
  const dictRegex = /<<([^>]*\/Subtype\s*\/Image[^>]*)>>\s*stream[\r\n]+([\s\S]*?)endstream/g;
  let match;

  while ((match = dictRegex.exec(pdfStr)) !== null) {
    const dict = match[1];
    const rawStream = match[2];

    const widthMatch = dict.match(/\/Width\s+(\d+)/);
    const heightMatch = dict.match(/\/Height\s+(\d+)/);
    const width = widthMatch ? parseInt(widthMatch[1], 10) : 600;
    const height = heightMatch ? parseInt(heightMatch[1], 10) : 400;

    let streamBuf: Buffer;
    const isAscii85 = /\/ASCII85Decode|\/A85/i.test(dict);
    const isFlate = /\/FlateDecode|\/Fl/i.test(dict);
    const isDct = /\/DCTDecode/i.test(dict);

    try {
      if (isAscii85) {
        streamBuf = decodeAscii85(rawStream);
      } else {
        streamBuf = Buffer.from(rawStream, 'latin1');
      }

      if (isFlate) {
        streamBuf = zlib.inflateSync(streamBuf);
      }

      if (isDct) {
        imgIndex++;
        images.push({
          id: `pdf_img_${imgIndex}`,
          mimeType: 'image/jpeg',
          dataUrl: `data:image/jpeg;base64,${streamBuf.toString('base64')}`,
          buffer: streamBuf,
          width,
          height,
        });
      } else if (streamBuf.length >= width * height * 3) {
        const dataUrl = rgbToBmpDataUrl(width, height, streamBuf);
        imgIndex++;
        images.push({
          id: `pdf_img_${imgIndex}`,
          mimeType: 'image/bmp',
          dataUrl,
          buffer: streamBuf,
          width,
          height,
        });
      } else if (streamBuf.length >= width * height) {
        // Grayscale image: convert to 24-bit RGB
        const rgbBuf = Buffer.alloc(width * height * 3);
        for (let p = 0; p < width * height; p++) {
          const v = streamBuf[p] ?? 0;
          rgbBuf[p * 3] = v;
          rgbBuf[p * 3 + 1] = v;
          rgbBuf[p * 3 + 2] = v;
        }
        const dataUrl = rgbToBmpDataUrl(width, height, rgbBuf);
        imgIndex++;
        images.push({
          id: `pdf_img_${imgIndex}`,
          mimeType: 'image/bmp',
          dataUrl,
          buffer: streamBuf,
          width,
          height,
        });
      }
    } catch {
      // Ignore corrupt or unsupported streams
    }
  }

  return images;
}
