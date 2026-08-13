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

  if (images.length === 0) {
    const pdfStr = buffer.toString('latin1');
    const imgRegex =
      /\/Type\s*\/XObject[\s\S]*?\/Subtype\s*\/Image[\s\S]*?\/Width\s*(\d+)[\s\S]*?\/Height\s*(\d+)[\s\S]*?stream[\r\n]+([\s\S]*?)endstream/g;
    let match;
    while ((match = imgRegex.exec(pdfStr)) !== null) {
      const width = parseInt(match[1], 10);
      const height = parseInt(match[2], 10);
      const streamBuf = Buffer.from(match[3], 'latin1');
      try {
        const inflated = zlib.inflateSync(streamBuf);
        if (inflated.length >= width * height * 3) {
          const dataUrl = rgbToBmpDataUrl(width, height, inflated);
          imgIndex++;
          images.push({
            id: `pdf_img_${imgIndex}`,
            mimeType: 'image/bmp',
            dataUrl,
            buffer: inflated,
            width,
            height,
          });
        }
      } catch {
        /* skip invalid stream */
      }
    }
  }

  return images;
}
