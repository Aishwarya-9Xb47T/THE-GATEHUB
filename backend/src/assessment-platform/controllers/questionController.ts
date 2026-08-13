import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.js";
import * as questionService from "../services/questionService.js";
import * as mediaService from "../services/mediaService.js";
import * as importService from "../services/questionImport.js";
import * as collectionService from "../services/questionCollectionService.js";
import type { QuestionRelationType } from "../domain/questionMetadata.js";
import type { ImportSource } from "../services/questionImport.js";

function actor(req: AuthRequest) {
  return { userId: req.user!.id, role: req.user!.role };
}

export async function create(req: AuthRequest, res: Response) {
  const data = await questionService.createQuestion(req.user!.id, req.body);
  res.status(201).json({ success: true, data });
}

export async function list(req: AuthRequest, res: Response) {
  const q = req.query as Record<string, string | undefined>;
  const data = await questionService.searchQuestions(
    actor(req).userId,
    actor(req).role,
    {
      q: q.q,
      typeSlug: q.typeSlug,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
      bloomLevel: q.bloomLevel,
      visibility: q.visibility,
      status: q.status,
      authorId: q.authorId,
      aiGenerated: q.aiGenerated === "true" ? true : q.aiGenerated === "false" ? false : undefined,
      hasMedia: q.hasMedia === "true",
      language: q.language,
      collectionId: q.collectionId,
      minHealthScore: q.minHealthScore ? Number(q.minHealthScore) : undefined,
    },
    q.limit ? Number(q.limit) : 50,
    q.offset ? Number(q.offset) : 0
  );
  res.json({ success: true, data });
}

export async function getById(req: AuthRequest, res: Response) {
  const data = await questionService.getQuestion(
    req.params.id!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function update(req: AuthRequest, res: Response) {
  const data = await questionService.updateQuestion(
    req.params.id!,
    actor(req).userId,
    actor(req).role,
    req.body
  );
  res.json({ success: true, data });
}

export async function publish(req: AuthRequest, res: Response) {
  const data = await questionService.publishQuestion(
    req.params.id!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function archive(req: AuthRequest, res: Response) {
  const data = await questionService.archiveQuestion(
    req.params.id!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function listVersions(req: AuthRequest, res: Response) {
  const data = await questionService.listQuestionVersions(
    req.params.id!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function getVersion(req: AuthRequest, res: Response) {
  const data = await questionService.getQuestionVersion(
    req.params.id!,
    req.params.versionId!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function fork(req: AuthRequest, res: Response) {
  const data = await questionService.forkQuestion(
    req.params.id!,
    actor(req).userId,
    actor(req).role
  );
  res.status(201).json({ success: true, data });
}

export async function validate(req: AuthRequest, res: Response) {
  const data = await questionService.validateQuestionDraft(
    req.params.id!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function tag(req: AuthRequest, res: Response) {
  const { tags } = req.body as { tags: string[] };
  const data = await questionService.tagQuestion(
    req.params.id!,
    tags,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function addRelation(req: AuthRequest, res: Response) {
  const { childQuestionId, relationType, order } = req.body as {
    childQuestionId: string;
    relationType: QuestionRelationType;
    order?: number;
  };
  const data = await questionService.addQuestionRelation(
    req.params.id!,
    childQuestionId,
    relationType,
    actor(req).userId,
    actor(req).role,
    order
  );
  res.status(201).json({ success: true, data });
}

export async function removeRelation(req: AuthRequest, res: Response) {
  const data = await questionService.removeQuestionRelation(
    req.params.relationId!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function attachMedia(req: AuthRequest, res: Response) {
  const data = await mediaService.attachMediaToQuestion(
    req.params.id!,
    actor(req).userId,
    actor(req).role,
    req.body
  );
  res.status(201).json({ success: true, data });
}

export async function detachMedia(req: AuthRequest, res: Response) {
  const data = await mediaService.detachMediaFromQuestion(
    req.params.usageId!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function importBatch(req: AuthRequest, res: Response) {
  const { source, questions } = req.body as { source: ImportSource; questions: unknown[] };
  const data = await importService.importQuestions(req.user!.id, source, questions);
  res.status(201).json({ success: true, data });
}

export async function evaluate(req: AuthRequest, res: Response) {
  const { answer } = req.body as { answer: unknown };
  const data = await questionService.evaluateQuestionAnswer(req.params.versionId!, answer);
  res.json({ success: true, data });
}

// Collections
export async function createCollection(req: AuthRequest, res: Response) {
  const data = await collectionService.createCollection(req.user!.id, req.body);
  res.status(201).json({ success: true, data });
}

export async function listCollections(req: AuthRequest, res: Response) {
  const { kind } = req.query as { kind?: string };
  const data = await collectionService.listCollections(req.user!.id, kind);
  res.json({ success: true, data });
}

export async function addToCollection(req: AuthRequest, res: Response) {
  const { questionId, order } = req.body as { questionId: string; order?: number };
  const data = await collectionService.addQuestionToCollection(
    req.params.collectionId!,
    questionId,
    actor(req).userId,
    actor(req).role,
    order
  );
  res.status(201).json({ success: true, data });
}

export async function removeFromCollection(req: AuthRequest, res: Response) {
  const data = await collectionService.removeQuestionFromCollection(
    req.params.collectionId!,
    req.params.questionId!,
    actor(req).userId
  );
  res.json({ success: true, data });
}

export async function listCollectionQuestions(req: AuthRequest, res: Response) {
  const data = await collectionService.listCollectionQuestions(
    req.params.collectionId!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}
