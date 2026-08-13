import type { Request, Response } from "express";
import {
  answerDocumentationQuestion,
  streamDocumentationAnswer,
} from "../services/docsAssistantService.js";
import { getOrGeneratePdf } from "../services/docsPdfService.js";
import { listManuals } from "../services/docsIndexService.js";
import { hybridSearch, toAssistantSources } from "../services/docsHybridSearch.js";
import { buildConversationalAnswer } from "../services/docsAnswerBuilder.js";
import { getAssistantLogSummary } from "../services/docsAssistantLogService.js";
import { z } from "zod";

const historySchema = z.array(
  z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(4000),
  }),
).max(12).optional();

const chatSchema = z.object({
  question: z.string().min(1).max(2000),
  pageContext: z
    .object({
      pathname: z.string().max(500).optional(),
      label: z.string().max(200).optional(),
      area: z.string().max(100).optional(),
      role: z.string().max(50).optional(),
      hints: z.array(z.string().max(200)).max(8).optional(),
      learning: z
        .object({
          universeId: z.string().max(100).optional(),
          universeTitle: z.string().max(300).optional(),
          lessonId: z.string().max(100).optional(),
          lessonTitle: z.string().max(300).optional(),
          stepId: z.string().max(100).nullable().optional(),
          stepTitle: z.string().max(300).nullable().optional(),
          stepKind: z.string().max(80).nullable().optional(),
          progressPercent: z.number().min(0).max(100).optional(),
        })
        .optional(),
    })
    .optional(),
  history: historySchema,
  stream: z.boolean().optional(),
});

const SAFE_USER_ERROR =
  "I'm currently unavailable. Please try again later or search the documentation.";

export async function chat(req: Request, res: Response) {
  try {
    const body = chatSchema.parse(req.body);
    const { question, pageContext, history, stream } = body;

    if (stream) {
      await streamDocumentationAnswer(question, res, { pageContext, history });
      return;
    }

    const result = await answerDocumentationQuestion(question, { pageContext, history });
    res.json({
      success: true,
      data: {
        answer: result.answer,
        sources: result.sources,
        relatedTopics: result.relatedTopics,
        followUpSuggestions: result.followUpSuggestions,
        fromFallback: result.fromFallback,
        usedAI: result.usedAI,
        confidence: result.confidence,
      },
    });
  } catch {
    const question = typeof req.body?.question === "string" ? req.body.question : "";
    const history = Array.isArray(req.body?.history) ? req.body.history : undefined;
    try {
      const ranked = await hybridSearch(question, { limit: 6, history });
      const chunks = ranked.map((r) => r.chunk);
      const conv = buildConversationalAnswer(chunks, question, history);
      const sources = toAssistantSources(conv.sources.length ? conv.sources : chunks);

      res.json({
        success: true,
        data: {
          answer: conv.answer || SAFE_USER_ERROR,
          sources,
          relatedTopics: conv.relatedTopics,
          followUpSuggestions: conv.followUpSuggestions,
          fromFallback: true,
          usedAI: false,
          confidence: conv.confidence,
        },
      });
    } catch {
      res.json({
        success: true,
        data: {
          answer: SAFE_USER_ERROR,
          sources: [],
          relatedTopics: [],
          followUpSuggestions: [],
          fromFallback: true,
          usedAI: false,
          confidence: "low",
        },
      });
    }
  }
}

export async function chatStream(req: Request, res: Response) {
  try {
    const body = chatSchema.parse(req.body);
    await streamDocumentationAnswer(body.question, res, {
      pageContext: body.pageContext,
      history: body.history,
    });
  } catch {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        answer: SAFE_USER_ERROR,
        sources: [],
        relatedTopics: [],
        followUpSuggestions: [],
        fromFallback: true,
      })}\n\n`,
    );
    res.end();
  }
}

export async function search(req: Request, res: Response) {
  const q = String(req.query.q || "");
  const ranked = await hybridSearch(q, { limit: 10 });
  const results = ranked.map((r) => ({
    manual: r.chunk.manual,
    section: r.chunk.section,
    snippet: r.chunk.content.slice(0, 200),
    slug: r.chunk.slug,
    sectionId: r.chunk.sectionId,
    href: `/help/${r.chunk.slug}#${r.chunk.sectionId}`,
    score: r.score,
  }));
  res.json({ success: true, data: results });
}

export async function listDocs(_req: Request, res: Response) {
  res.json({ success: true, data: listManuals() });
}

export async function assistantStats(_req: Request, res: Response) {
  res.json({ success: true, data: getAssistantLogSummary() });
}

export async function downloadPdf(req: Request, res: Response) {
  const manual = req.params.manual;
  const pdf = await getOrGeneratePdf(manual);
  if (!pdf) {
    return res.status(404).json({ success: false, error: "Manual not found" });
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${pdf.filename}"`);
  res.send(pdf.buffer);
}
