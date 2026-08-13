import mammoth from "mammoth";
import AdmZip from "adm-zip";
import OpenAI from "openai";
import { ImportError } from "./importErrors.js";

const getOpenAi = (): OpenAI | null => {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? new OpenAI({ apiKey: k }) : null;
};

async function loadPdfParse() {
  const mod = await import("pdf-parse");
  return mod.default ?? mod;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = await loadPdfParse();
  const result = await pdfParse(buffer);
  const text = (result.text || "").trim();
  if (!text) {
    throw new ImportError(
      422,
      "PDF_SCANNED",
      "This PDF has no selectable text ΓÇö it may be scanned.",
      "Upload page images (PNG/JPEG) for OCR, or use a text-based PDF export.",
      true
    );
  }
  return text;
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value || "").trim();
  if (!text) throw new ImportError(422, "FILE_EMPTY", "Could not extract text from DOCX.", "Ensure the document contains text.", true);
  return text;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function xmlTextFromSlide(xml: string): string {
  const parts: string[] = [];
  const re = /<a:t[^>]*>([^<]*)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    if (match[1]?.trim()) parts.push(decodeXml(match[1].trim()));
  }
  return parts.join("\n");
}

export async function extractTextFromPptx(buffer: Buffer): Promise<string> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName));
  if (!entries.length) throw new ImportError(422, "FILE_EMPTY", "No slides found in PPTX.", "Upload a valid PowerPoint file.", true);

  const slides = entries
    .sort((a, b) => {
      const na = Number(a.entryName.match(/slide(\d+)/i)?.[1] || 0);
      const nb = Number(b.entryName.match(/slide(\d+)/i)?.[1] || 0);
      return na - nb;
    })
    .map((entry, i) => {
      const body = entry.getData().toString("utf8");
      const text = xmlTextFromSlide(body);
      return `--- Slide ${i + 1} ---\n${text}`;
    })
    .filter((s) => s.replace(/--- Slide \d+ ---/, "").trim());

  if (!slides.length) throw new ImportError(422, "FILE_EMPTY", "Could not extract text from slides.", "Add text to slides or export as PDF.", true);
  return slides.join("\n\n");
}

export async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  if (getOpenAi()) {
    try {
      const base64 = buffer.toString("base64");
      const res = await getOpenAi()!.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract ALL visible text from this image for assessment import. Include questions, answer options, equations (as LaTeX where possible), tables (as markdown), and code blocks. Preserve structure.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
            ],
          },
        ],
        max_tokens: 4000,
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err) {
      console.warn("[textExtractors] Image OCR failed:", err);
    }
  }

  throw new ImportError(
    422,
    "OCR_UNAVAILABLE",
    "Image OCR requires a working OpenAI API key on the server.",
    "Configure OPENAI_API_KEY, or paste questions as text.",
    false
  );
}

export function extractTextFromPlain(buffer: Buffer): string {
  const text = buffer.toString("utf8").trim();
  if (!text) throw new ImportError(422, "FILE_EMPTY", "File is empty.", "Upload a non-empty file.", false);
  return text;
}
