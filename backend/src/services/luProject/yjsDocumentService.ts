import { prisma } from "../../utils/prisma.js";

export function yjsDocName(projectId: string, fileId: string): string {
  return `project/${projectId}/file/${fileId}`;
}

/** Clear collaborative history so the next editor session loads canonical DB content. */
export async function resetYjsDocument(projectId: string, fileId: string): Promise<void> {
  const docName = yjsDocName(projectId, fileId);
  await prisma.yjsUpdate.deleteMany({ where: { docName } });
  await prisma.yjsSnapshot.deleteMany({ where: { docName } });
}

export async function resetYjsForFileIds(projectId: string, fileIds: string[]): Promise<void> {
  const unique = [...new Set(fileIds.filter(Boolean))];
  await Promise.all(unique.map((fileId) => resetYjsDocument(projectId, fileId)));
}
