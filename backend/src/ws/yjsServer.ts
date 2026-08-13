import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { setupWSConnection, docs } from "y-websocket/bin/utils";
import { prisma } from "../utils/prisma.js";
import { logger } from "../utils/logger.js";
import { isLuGeneratedTexPath } from "../services/luProject/luGeneratedPaths.js";
import { isLuV2Project, loadProjectFiles } from "../services/luProject/luProjectFiles.js";

const syncIntervals = new Map<string, NodeJS.Timeout>();

function getYDoc(docName: string): Y.Doc {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(docName, doc);
  }
  return doc;
}

// Load the document from PostgreSQL snapshots + updates
async function loadDocumentFromDB(docName: string): Promise<Y.Doc> {
  const doc = new Y.Doc();
  const parts = docName.split("/");
  const fileId = parts[3]?.split("?")[0];
  
  logger.info(`[Yjs Bootstrap] Loading doc: ${docName}, fileId: ${fileId}`);

  // 1. Fetch latest snapshot
  const snapshot = await prisma.yjsSnapshot.findFirst({
    where: { docName },
    orderBy: { version: 'desc' }
  });

  let hasHistory = false;
  if (snapshot) {
    Y.applyUpdate(doc, new Uint8Array(snapshot.state));
    hasHistory = true;
    logger.info(`[Yjs Bootstrap] Loaded snapshot v${snapshot.version} for ${docName}. Length: ${doc.getText('monaco').length}`);
  }

  // 2. Fetch trailing updates applied after the snapshot
  const updates = await prisma.yjsUpdate.findMany({
    where: { 
      docName, 
      createdAt: { gt: snapshot?.createdAt || new Date(0) }
    },
    orderBy: { createdAt: 'asc' }
  });

  // 3. Incrementally apply deltas to state
  for (const row of updates) {
    Y.applyUpdate(doc, new Uint8Array(row.update));
    hasHistory = true;
  }
  if (updates.length > 0) {
    logger.info(`[Yjs Bootstrap] Applied ${updates.length} updates for ${docName}. Current length: ${doc.getText('monaco').length}`);
  }

  // 4. BOOTSTRAP FALLBACK: If NO Yjs history exists OR it's empty, load from static content field in DB
  const ytext = doc.getText('monaco');
  if (ytext.length === 0 && fileId) {
    const file = await prisma.latexFile.findUnique({ where: { id: fileId } });
    if (file && file.content && file.content.length > 0) {
      logger.info(`[Yjs Bootstrap] Yjs history empty/missing. Seeding from LatexFile.content. Length: ${file.content.length}`);
      doc.transact(() => {
        ytext.insert(0, file.content!);
      });
    } else {
      logger.warn(`[Yjs Bootstrap] No history AND no file content found for ${docName}`);
    }
  } else {
    logger.info(`[Yjs Bootstrap] Yjs state initialized with length: ${ytext.length}`);
  }

  return doc;
}

export function createYjsServer(server: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: any, socket: any, head: any) => {
    if (!request.url?.startsWith("/yjs/")) return;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", async (ws, req) => {
    const rawDocName = req.url!.split("/yjs/")[1];
    const docName = rawDocName.split("?")[0];

    const isNewDoc = !docs.has(docName);
    const doc = getYDoc(docName);

    if (isNewDoc) {
      const bootstrapDoc = await loadDocumentFromDB(docName);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(bootstrapDoc));

      let updateCount = 0;
      const SNAPSHOT_THRESHOLD = 50;

      doc.on("update", async (update: Uint8Array) => {
        try {
          await prisma.yjsUpdate.create({
            data: {
              docName,
              update: Buffer.from(update),
            },
          });

          updateCount++;
          if (updateCount >= SNAPSHOT_THRESHOLD) {
            updateCount = 0;
            const stateVector = Y.encodeStateAsUpdate(doc);

            await prisma.$transaction(async (tx) => {
              const latestSnapshot = await tx.yjsSnapshot.findFirst({
                where: { docName },
                orderBy: { version: "desc" },
              });
              const newVersion = (latestSnapshot?.version || 0) + 1;
              const snapshotParams = { docName, state: Buffer.from(stateVector), version: newVersion };

              await tx.yjsSnapshot.create({ data: snapshotParams });
              await tx.yjsUpdate.deleteMany({ where: { docName, createdAt: { lt: new Date() } } });
            });
            logger.info(`Created snapshot v${updateCount} for ${docName}`);
          }
        } catch (e: any) {
          logger.error(`Failed persisting Yjs Delta to PostgreSQL: ${e.message}`);
        }
      });
    }

    setupWSConnection(ws, req, { docName });

    const [_, projectId, __, rawFileId] = docName.split("/");
    const fileId = rawFileId?.split("?")[0];
    if (fileId && !syncIntervals.has(docName)) {
      const interval = setInterval(async () => {
        const doc = docs.get(docName);
        if (doc) {
           const text = doc.getText("monaco").toString();
           if (!text || text.length === 0) return;
           try {
             const file = await prisma.latexFile.findUnique({
               where: { id: fileId },
               select: { path: true, projectId: true },
             });
             if (!file) return;
             const files = await loadProjectFiles(file.projectId);
             if (isLuV2Project(files) && isLuGeneratedTexPath(file.path)) return;
             await prisma.latexFile.update({
               where: { id: fileId },
               data: { content: text, updatedAt: new Date() },
             });
           } catch (err: any) {
             logger.error(`[Yjs Sync] Failed to update file ${fileId}: ${err.message}`);
           }
        }
      }, 5000);
      syncIntervals.set(docName, interval);
    }
    
    ws.on("close", async () => {
      const doc = docs.get(docName);
      // We only clean up if NO more connections are active for this doc
      const activeConns = (doc as any).conns?.size || 0;
      
      if (activeConns === 0) {
        clearInterval(syncIntervals.get(docName));
        syncIntervals.delete(docName);

        // FINAL SYNC to LatexFile table before closing
        if (doc && fileId) {
          const text = doc.getText("monaco").toString();
          if (text) {
            try {
              const file = await prisma.latexFile.findUnique({
                where: { id: fileId },
                select: { path: true, projectId: true },
              });
              if (file) {
                const files = await loadProjectFiles(file.projectId);
                if (!(isLuV2Project(files) && isLuGeneratedTexPath(file.path))) {
                  await prisma.latexFile.update({
                    where: { id: fileId },
                    data: { content: text, updatedAt: new Date() },
                  });
                }
              }
            } catch {
              /* ignore close sync errors */
            }
          }
        }

        // Final snapshot before GC
        if (doc) {
           try {
              const stateVector = Y.encodeStateAsUpdate(doc);
              await prisma.$transaction(async (tx) => {
                const latestSnapshot = await tx.yjsSnapshot.findFirst({
                  where: { docName },
                  orderBy: { version: 'desc' }
                });
                const newVersion = (latestSnapshot?.version || 0) + 1;
                await tx.yjsSnapshot.create({
                  data: { docName, state: Buffer.from(stateVector), version: newVersion }
                });
                // Keep only the latest snapshot and updates after it
                await tx.yjsUpdate.deleteMany({ where: { docName, createdAt: { lt: new Date() } } });
              });
              logger.info(`[Yjs GC] Final snapshot created for ${docName}`);
           } catch (e: any) {
              logger.error(`[Yjs GC] Failed final snapshot for ${docName}: ${e.message}`);
           }
        }

        docs.delete(docName);
      }
    });
  });

  logger.info("WebSocket PostgreSQL-Persisted Yjs Server running on /yjs/*");
}
