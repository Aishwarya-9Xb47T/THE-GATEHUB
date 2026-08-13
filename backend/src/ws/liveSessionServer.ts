import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { URL } from "url";
import { JWT_SECRET } from "../config/jwt.js";
import type { JwtPayload } from "../middlewares/auth.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import {
  buildSessionState,
  joinSession,
  saveLeaderboardSnapshot,
  buildLeaderboard,
  startSession,
  advanceQuestion,
  finishSession,
  logSessionEvent,
} from "../services/liveSession/liveSessionService.js";
import {
  formatAnswerResultPayload,
  resolveSessionPaceKind,
  routeLiveSubmit,
  sendParticipantState,
} from "../liveSession/liveAssessmentRouter.js";
import { AppError } from "../middlewares/errorHandler.js";
import { assertQuizReadyForLive } from "../services/liveSession/liveQuizValidation.js";

interface ClientMeta {
  userId: string;
  role: string;
  participantId?: string;
  isHost: boolean;
}

interface RoomState {
  clients: Map<WebSocket, ClientMeta>;
  previousRanks: Map<string, number>;
}

const rooms = new Map<string, RoomState>();

function getRoom(sessionId: string): RoomState {
  let room = rooms.get(sessionId);
  if (!room) {
    room = { clients: new Map(), previousRanks: new Map() };
    rooms.set(sessionId, room);
  }
  return room;
}

function broadcast(sessionId: string, message: object, exclude?: WebSocket) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const [ws] of room.clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

async function sendSessionState(sessionId: string) {
  const room = rooms.get(sessionId);
  const previousRanks = room?.previousRanks;
  const state = await buildSessionState(sessionId, previousRanks);

  if (room) {
    const newRanks = new Map<string, number>();
    for (const p of state.participants) {
      newRanks.set(p.participantId, p.rank);
    }
    room.previousRanks = newRanks;
  }

  broadcast(sessionId, { type: "session_state", state });
  return state;
}

async function verifyToken(token: string): Promise<{ userId: string; role: string } | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, suspended: true, deletedAt: true },
    });
    if (!user || user.suspended || user.deletedAt) return null;
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

export function createLiveSessionServer(server: import("http").Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = request.url || "";
    if (!url.startsWith("/live-sessions/ws/")) return;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const sessionId = url.pathname.split("/live-sessions/ws/")[1]?.split("/")[0];
    const token = url.searchParams.get("token");
    const wsMode = url.searchParams.get("mode");
    const device = url.searchParams.get("device") || "Unknown Device";

    if (!sessionId || !token) {
      ws.close(4001, "Missing session or token");
      return;
    }

    const auth = await verifyToken(token);
    if (!auth) {
      ws.close(4003, "Unauthorized");
      return;
    }

    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      ws.close(4004, "Session not found");
      return;
    }

    const isHost = session.hostUserId === auth.userId;
    let participantId: string | undefined;

    try {
      const shouldJoinAsParticipant = !isHost || wsMode === "play";
      if (shouldJoinAsParticipant) {
        // V2 Join Check: Limit and lock check
        const existing = await prisma.liveParticipant.findUnique({
          where: { sessionId_userId: { sessionId, userId: auth.userId } },
        });

        if (!existing) {
          if (session.isLocked) {
            ws.close(4003, "Quiz Room is Locked");
            return;
          }
          const currentParticipants = await prisma.liveParticipant.count({ where: { sessionId } });
          if (currentParticipants >= session.maxParticipants) {
            ws.close(4003, "Quiz Room Full");
            return;
          }
        }

        const participant = await joinSession(sessionId, auth.userId, auth.role);
        participantId = participant.id;

        // Save device / browser logs
        await prisma.liveParticipant.update({
          where: { id: participantId },
          data: { device, joinTime: new Date(), status: "online" },
        }).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Cannot join session";
      ws.close(4003, msg);
      return;
    }

    const room = getRoom(sessionId);
    const meta: ClientMeta = { userId: auth.userId, role: auth.role, participantId, isHost };
    room.clients.set(ws, meta);

    ws.send(JSON.stringify({ type: "connected", participantId, isHost }));

    const state = await buildSessionState(sessionId, room.previousRanks);
    ws.send(JSON.stringify({ type: "session_state", state }));

    if (participantId) {
      const paceKind = await resolveSessionPaceKind(sessionId);
      if (paceKind === "self_paced") {
        const playerState = await sendParticipantState(sessionId, participantId);
        ws.send(JSON.stringify({ type: "participant_state", state: playerState }));
      }
    }

    if (!isHost && participantId) {
      broadcast(sessionId, { type: "participant_joined", participantId }, ws);
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; [key: string]: unknown };
        const clientMeta = room.clients.get(ws);
        if (!clientMeta) return;

        if (clientMeta.participantId && msg.type !== "ping") {
          prisma.liveParticipant.update({
            where: { id: clientMeta.participantId },
            data: { lastSeenAt: new Date() },
          }).catch(() => {});
        }

        switch (msg.type) {
          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;

          // V2 Client-to-Room Media & Status Update Events
          case "client:status_update": {
            if (!clientMeta.participantId) break;
            const { status } = msg as unknown as { status: string };
            await prisma.liveParticipant.update({
              where: { id: clientMeta.participantId },
              data: { status },
            }).catch(() => {});
            await logSessionEvent(sessionId, "status_change", clientMeta.participantId, { status });
            broadcast(sessionId, {
              type: "participant_status_updated",
              participantId: clientMeta.participantId,
              status,
            });
            break;
          }

          case "client:media_state": {
            if (!clientMeta.participantId) break;
            const { cameraOn, micOn } = msg as unknown as { cameraOn: boolean; micOn: boolean };
            await prisma.liveParticipant.update({
              where: { id: clientMeta.participantId },
              data: { cameraOn, micOn },
            }).catch(() => {});
            await logSessionEvent(sessionId, "media_state", clientMeta.participantId, { cameraOn, micOn });
            broadcast(sessionId, {
              type: "participant_media_updated",
              participantId: clientMeta.participantId,
              cameraOn,
              micOn,
            });
            break;
          }

          case "client:raise_hand": {
            if (!clientMeta.participantId) break;
            const { raisedHand } = msg as unknown as { raisedHand: boolean };
            await prisma.liveParticipant.update({
              where: { id: clientMeta.participantId },
              data: { raisedHand },
            }).catch(() => {});
            await logSessionEvent(sessionId, "raise_hand", clientMeta.participantId, { raisedHand });
            broadcast(sessionId, {
              type: "participant_hand_updated",
              participantId: clientMeta.participantId,
              raisedHand,
            });
            break;
          }

          case "client:chat": {
            const { text } = msg as unknown as { text: string };
            const displayName = session.hostUserId === clientMeta.userId ? "Host" : (await prisma.liveParticipant.findUnique({
              where: { id: clientMeta.participantId },
              select: { displayName: true },
            }))?.displayName || "Anonymous";

            await logSessionEvent(sessionId, "chat", clientMeta.participantId || null, { text, displayName });
            broadcast(sessionId, {
              type: "chat_received",
              participantId: clientMeta.participantId || null,
              displayName,
              text,
              timestamp: new Date().toISOString(),
            });
            break;
          }

          case "client:reaction": {
            if (!clientMeta.participantId) break;
            const { reaction } = msg as unknown as { reaction: string };
            await logSessionEvent(sessionId, "reaction", clientMeta.participantId, { reaction });
            broadcast(sessionId, {
              type: "reaction_received",
              participantId: clientMeta.participantId,
              reaction,
            });
            break;
          }
          case "client:update_music": {
            if (!clientMeta.isHost) break;
            const payload = msg as any;
            logger.info(`[LIVE DEBUG] Received client:update_music: musicEnabled=${payload.musicEnabled}, musicPlaying=${payload.musicPlaying}, playlistLength=${payload.playlist?.length}, currentTrackIndex=${payload.currentTrackIndex}`);
            
            const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
            if (session) {
              const currentSettings = typeof session.settings === 'object' && session.settings !== null ? (session.settings as any) : {};
              const updatedSettings = {
                ...currentSettings,
                musicEnabled: payload.musicEnabled,
                musicPlaying: payload.musicPlaying,
                musicVolume: payload.musicVolume,
                musicLoop: payload.musicLoop,
                musicShuffle: payload.musicShuffle,
                currentTrackIndex: payload.currentTrackIndex,
                playlist: payload.playlist,
                trackOffsetMs: payload.trackOffsetMs || 0,
                musicSyncSentAt: payload.sentAt || Date.now(),
                eventKey: payload.eventKey || currentSettings.eventKey || null,
              };
              await prisma.liveSession.update({
                where: { id: sessionId },
                data: { settings: updatedSettings },
              }).catch(() => {});
 
              // Determine event type based on change for Phase 9 logging
              let eventType = "music:update";
              if (payload.musicPlaying !== currentSettings.musicPlaying) {
                eventType = payload.musicPlaying ? "music:start" : "music:pause";
              } else if (payload.currentTrackIndex !== currentSettings.currentTrackIndex) {
                eventType = "music:track_change";
              } else if (payload.musicVolume !== currentSettings.musicVolume) {
                eventType = "music:volume_change";
              } else if (payload.musicLoop !== currentSettings.musicLoop || payload.musicShuffle !== currentSettings.musicShuffle) {
                eventType = "music:settings";
              }
 
              const activeTrack = payload.playlist?.[payload.currentTrackIndex];
              await logSessionEvent(sessionId, eventType, null, {
                trackName: activeTrack?.name || "Unknown Track",
                trackUrl: activeTrack?.url || "",
                musicPlaying: payload.musicPlaying,
                musicVolume: payload.musicVolume,
                musicLoop: payload.musicLoop,
                musicShuffle: payload.musicShuffle,
                trackOffsetMs: payload.trackOffsetMs || 0,
                currentTrackIndex: payload.currentTrackIndex,
                eventKey: payload.eventKey || null,
              }).catch(() => {});
            }
 
            broadcast(sessionId, {
              type: "music_state_updated",
              musicEnabled: payload.musicEnabled,
              musicPlaying: payload.musicPlaying,
              musicVolume: payload.musicVolume,
              musicLoop: payload.musicLoop,
              musicShuffle: payload.musicShuffle,
              currentTrackIndex: payload.currentTrackIndex,
              playlist: payload.playlist,
              trackOffsetMs: payload.trackOffsetMs || 0,
              sentAt: payload.sentAt || Date.now(),
              eventKey: payload.eventKey || null,
            });
            break;
          }

          case "client:use_powerup": {
            if (!clientMeta.participantId) break;
            const { powerup, questionId } = msg as unknown as { powerup: string; questionId: string };
            const participant = await prisma.liveParticipant.findUnique({
              where: { id: clientMeta.participantId }
            });
            if (!participant) break;

            let inventory: string[] = [];
            try {
              inventory = Array.isArray(participant.powerups)
                ? (participant.powerups as string[])
                : JSON.parse((participant.powerups as string) || "[]");
            } catch {
              inventory = [];
            }

            if (!inventory.includes(powerup)) {
              ws.send(JSON.stringify({ type: "error", message: "Powerup not in inventory" }));
              break;
            }

            if (powerup === "50-50") {
              const question = await prisma.question.findUnique({
                where: { id: questionId },
                include: { options: true }
              });
              if (!question) break;

              const incorrectOptions = question.options.filter(o => !o.isCorrect);
              const toHide = incorrectOptions.sort(() => 0.5 - Math.random()).slice(0, 2).map(o => o.id);
              const updatedInventory = inventory.filter(p => p !== "50-50");
              await prisma.liveParticipant.update({
                where: { id: participant.id },
                data: { powerups: updatedInventory as any }
              });
              ws.send(JSON.stringify({
                type: "powerup_result",
                powerup: "50-50",
                questionId,
                hiddenOptionIds: toHide,
                updatedInventory,
              }));
              await logSessionEvent(sessionId, "use_powerup", participant.id, { powerup, questionId });
            } else if (powerup === "extra_time") {
              const updatedInventory = inventory.filter(p => p !== "extra_time");
              await prisma.liveParticipant.update({
                where: { id: participant.id },
                data: { powerups: updatedInventory as any }
              });
              ws.send(JSON.stringify({
                type: "powerup_result",
                powerup: "extra_time",
                questionId,
                extraTimeSeconds: 15,
                updatedInventory,
              }));
              await logSessionEvent(sessionId, "use_powerup", participant.id, { powerup, questionId });
            }
            break;
          }

          case "client:violation": {
            if (!clientMeta.participantId) break;
            const { violationType, details, screenshot, questionIndex } = msg as any;
            await prisma.liveParticipant.update({
              where: { id: clientMeta.participantId },
              data: { violationCount: { increment: 1 } },
            }).catch(() => {});
            await logSessionEvent(sessionId, "violation", clientMeta.participantId, { violationType, details, screenshot, questionIndex });
            broadcast(sessionId, {
              type: "violation_alert",
              participantId: clientMeta.participantId,
              violationType,
              details,
              screenshot,
              questionIndex,
              timestamp: new Date().toISOString(),
            });
            break;
          }

          case "client:telemetry": {
            if (!clientMeta.participantId) break;
            const { batteryStatus, browser, tabFocused, fullscreen, networkStatus } = msg as unknown as {
              batteryStatus?: string;
              browser?: string;
              tabFocused?: boolean;
              fullscreen?: boolean;
              networkStatus?: string;
            };
            await prisma.liveParticipant.update({
              where: { id: clientMeta.participantId },
              data: {
                batteryStatus: batteryStatus !== undefined ? batteryStatus : undefined,
                browser: browser !== undefined ? browser : undefined,
                tabFocused: tabFocused !== undefined ? tabFocused : undefined,
                fullscreen: fullscreen !== undefined ? fullscreen : undefined,
                networkStatus: networkStatus !== undefined ? networkStatus : undefined,
              },
            }).catch(() => {});
            broadcast(sessionId, {
              type: "participant_telemetry_updated",
              participantId: clientMeta.participantId,
              telemetry: { batteryStatus, browser, tabFocused, fullscreen, networkStatus },
            });
            break;
          }

          case "client:snapshot": {
            if (!clientMeta.participantId) break;
            const { frame } = msg as unknown as { frame: string };
            // Save webcam snapshot event to database
            await logSessionEvent(sessionId, "snapshot", clientMeta.participantId, { frame }).catch(() => {});
            // Broadcast camera frame to the host only
            for (const [clientWs, clientMetaInfo] of room.clients) {
              if (clientMetaInfo.isHost) {
                clientWs.send(JSON.stringify({
                  type: "participant_snapshot",
                  participantId: clientMeta.participantId,
                  frame,
                }));
              }
            }
            break;
          }

          case "host:action": {
            if (!clientMeta.isHost) return;
            const { action, targetId, payload } = msg as unknown as { action: string; targetId: string; payload?: any };
            await logSessionEvent(sessionId, "host_action", null, { action, targetId, payload });

            if (action === "warn") {
              for (const [clientWs, clientMetaInfo] of room.clients) {
                if (clientMetaInfo.participantId === targetId) {
                  clientWs.send(JSON.stringify({
                    type: "warning",
                    message: payload?.message || "Please focus on the assessment.",
                  }));
                  break;
                }
              }
            } else if (action === "kick") {
              for (const [clientWs, clientMetaInfo] of room.clients) {
                if (clientMetaInfo.participantId === targetId) {
                  clientWs.send(JSON.stringify({ type: "kicked" }));
                  clientWs.close(4003, "You have been kicked by the host.");
                  room.clients.delete(clientWs);
                  break;
                }
              }
              await prisma.liveParticipant.delete({ where: { id: targetId } }).catch(() => {});
              broadcast(sessionId, { type: "participant_left", participantId: targetId });
              await sendSessionState(sessionId);
            } else if (action === "mute_mic") {
              await prisma.liveParticipant.update({
                where: { id: targetId },
                data: { micOn: false },
              }).catch(() => {});
              for (const [clientWs, clientMetaInfo] of room.clients) {
                if (clientMetaInfo.participantId === targetId) {
                  clientWs.send(JSON.stringify({ type: "mute_mic" }));
                  break;
                }
              }
              broadcast(sessionId, { type: "participant_media_updated", participantId: targetId, micOn: false });
            } else if (action === "disable_camera") {
              await prisma.liveParticipant.update({
                where: { id: targetId },
                data: { cameraOn: false },
              }).catch(() => {});
              for (const [clientWs, clientMetaInfo] of room.clients) {
                if (clientMetaInfo.participantId === targetId) {
                  clientWs.send(JSON.stringify({ type: "disable_camera" }));
                  break;
                }
              }
              broadcast(sessionId, { type: "participant_media_updated", participantId: targetId, cameraOn: false });
            } else if (action === "private_msg") {
              for (const [clientWs, clientMetaInfo] of room.clients) {
                if (clientMetaInfo.participantId === targetId) {
                  clientWs.send(JSON.stringify({
                    type: "private_msg",
                    message: payload?.message,
                  }));
                  break;
                }
              }
            } else if (action === "announcement") {
              broadcast(sessionId, {
                type: "announcement",
                message: payload?.message,
              });
            }
            break;
          }

          case "host:extend_timer": {
            if (!clientMeta.isHost) return;
            const { seconds } = msg as unknown as { seconds: number };
            await logSessionEvent(sessionId, "host_control", null, { action: "extend_timer", seconds });
            broadcast(sessionId, { type: "timer_extended", seconds });
            break;
          }

          case "host:reduce_timer": {
            if (!clientMeta.isHost) return;
            const { seconds } = msg as unknown as { seconds: number };
            await logSessionEvent(sessionId, "host_control", null, { action: "reduce_timer", seconds });
            broadcast(sessionId, { type: "timer_reduced", seconds });
            break;
          }

          // V2 Instructor Control Events
          case "host:question_countdown": {
            if (!clientMeta.isHost) return;
            const { questionIndex } = msg as unknown as { questionIndex: number };
            broadcast(sessionId, {
              type: "question_countdown",
              questionIndex,
              duration: 3,
            });
            break;
          }

          case "host:pause_resume": {
            if (!clientMeta.isHost) return;
            const { isPaused } = msg as unknown as { isPaused: boolean };
            await prisma.liveSession.update({
              where: { id: sessionId },
              data: { isPaused },
            }).catch(() => {});
            broadcast(sessionId, {
              type: "session_paused_resumed",
              isPaused,
            });
            break;
          }

          case "host:toggle_chat": {
            if (!clientMeta.isHost) return;
            const { chatEnabled } = msg as unknown as { chatEnabled: boolean };
            await prisma.liveSession.update({
              where: { id: sessionId },
              data: { chatEnabled },
            }).catch(() => {});
            broadcast(sessionId, {
              type: "chat_toggled",
              chatEnabled,
            });
            break;
          }

          case "host:lock_room": {
            if (!clientMeta.isHost) return;
            const { isLocked } = msg as unknown as { isLocked: boolean };
            await prisma.liveSession.update({
              where: { id: sessionId },
              data: { isLocked },
            }).catch(() => {});
            broadcast(sessionId, {
              type: "room_locked_unlocked",
              isLocked,
            });
            break;
          }

          case "host:toggle_leaderboard": {
            if (!clientMeta.isHost) return;
            const { leaderboardHidden } = msg as unknown as { leaderboardHidden: boolean };
            await prisma.liveSession.update({
              where: { id: sessionId },
              data: { leaderboardHidden },
            }).catch(() => {});
            broadcast(sessionId, {
              type: "leaderboard_toggled",
              leaderboardHidden,
            });
            break;
          }

          case "host:kick": {
            if (!clientMeta.isHost) return;
            const { participantId: targetId } = msg as unknown as { participantId: string };
            
            // Send kick event to target socket
            for (const [clientWs, clientMetaInfo] of room.clients) {
              if (clientMetaInfo.participantId === targetId) {
                clientWs.send(JSON.stringify({ type: "kicked" }));
                clientWs.close(4003, "You have been kicked by the host.");
                room.clients.delete(clientWs);
                break;
              }
            }
            
            await prisma.liveParticipant.delete({ where: { id: targetId } }).catch(() => {});
            broadcast(sessionId, {
              type: "participant_left",
              participantId: targetId,
            });
            
            await sendSessionState(sessionId);
            break;
          }

          case "answer": {
            if (!clientMeta.participantId) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "You are not joined as a participant. Open the play link to answer questions.",
                })
              );
              break;
            }
            const { questionId, answer } = msg as unknown as { questionId: string; answer: unknown };
            const { paceKind, transition } = await routeLiveSubmit(
              sessionId,
              clientMeta.participantId,
              clientMeta.userId,
              questionId,
              answer
            );
            const resultPayload = formatAnswerResultPayload(transition.payload);
            if (!resultPayload) break;

            ws.send(JSON.stringify({ type: "answer_result", ...resultPayload }));

            broadcast(sessionId, {
              type: "answer_received",
              participantId: clientMeta.participantId,
              questionId,
            });

            const leaderboard = await buildLeaderboard(sessionId, room.previousRanks);
            if (room) {
              const newRanks = new Map<string, number>();
              for (const entry of leaderboard) {
                newRanks.set(entry.participantId, entry.rank);
              }
              room.previousRanks = newRanks;
            }
            broadcast(sessionId, { type: "leaderboard", rankings: leaderboard });

            if (paceKind === "self_paced") {
              const playerState = await sendParticipantState(sessionId, clientMeta.participantId);
              ws.send(JSON.stringify({ type: "participant_state", state: playerState }));
              if (resultPayload.isPersonalComplete) {
                ws.send(
                  JSON.stringify({
                    type: "participant_finished",
                    participantId: clientMeta.participantId,
                  })
                );
              }
            } else {
              await sendSessionState(sessionId);
            }
            break;
          }

          case "host:start": {
            if (!clientMeta.isHost) return;
            
            logger.info(`[PIPELINE STAGE 1] Host sent host:start event. sessionId=${sessionId}`);
            
            // 1. Fetch the live session to validate and lock
            const session = await prisma.liveSession.findUnique({
              where: { id: sessionId },
              include: {
                participants: true,
                quiz: {
                  include: {
                    questions: {
                      orderBy: { order: "asc" },
                      include: { options: { orderBy: { order: "asc" } } },
                    },
                  },
                },
              },
            });
            if (!session) {
              logger.error(`[LIVE DEBUG] Error starting session: Live session not found. File: liveSessionServer.ts, Line: 647`);
              throw new AppError(404, "Live session not found");
            }
            if (session.status === "finished") {
              logger.error(`[LIVE DEBUG] Error starting session: Session already finished. File: liveSessionServer.ts, Line: 651`);
              throw new AppError(400, "Session already finished");
            }
            if (session.participants.length === 0) {
              logger.error(`[LIVE DEBUG] Error starting session: No participants have joined yet. File: liveSessionServer.ts, Line: 655`);
              throw new AppError(400, "No participants have joined yet");
            }
            
            // Validate the quiz questions
            await assertQuizReadyForLive(session.quizId).catch((err) => {
              logger.error(`[LIVE DEBUG] Error starting session: Quiz validation failed. Reason: ${err.message}. File: liveSessionServer.ts, Line: 661`);
              throw err;
            });

            logger.info(`[PIPELINE STAGE 2] Server received host:start, validation passed. Locking room and starting countdown.`);

            // 2. Lock the room in the database
            await prisma.liveSession.update({
              where: { id: sessionId },
              data: { isLocked: true },
            });
            
            // 3. Broadcast countdown event immediately to all participants
            broadcast(sessionId, {
              type: "question_countdown",
              questionIndex: 0,
              duration: 3,
            });
            logger.info(`[LIVE DEBUG] Countdown sent to all participants.`);
            
            // 4. Set a 3 seconds server-side timeout to start the quiz
            setTimeout(async () => {
              try {
                logger.info(`[PIPELINE STAGE 3] Countdown complete. Calling startSession().`);
                const result = await startSession(sessionId, auth.userId, auth.role);
                logger.info(`[PIPELINE STAGE 3] startSession() completed. Result status=${result.status}, currentQuestionIndex=${result.currentQuestionIndex}`);
                
                logger.info(`[PIPELINE STAGE 4] Database updated. Verifying session state...`);
                const verifySession = await prisma.liveSession.findUnique({
                  where: { id: sessionId },
                  select: { status: true, currentQuestionIndex: true, startedAt: true, settings: true }
                });
                logger.info(`[PIPELINE STAGE 4] Database state: status=${verifySession?.status}, currentQuestionIndex=${verifySession?.currentQuestionIndex}, startedAt=${verifySession?.startedAt}`);
                
                logger.info(`[PIPELINE STAGE 5] Calling buildSessionState()...`);
                const paceKind = await resolveSessionPaceKind(sessionId);
                const roomState = await buildSessionState(sessionId, room.previousRanks);
                logger.info(`[PIPELINE STAGE 5] buildSessionState() result: status=${roomState.status}, currentQuestionIndex=${roomState.currentQuestionIndex}, questionCount=${roomState.questionCount}, hasCurrentQuestion=${!!roomState.currentQuestion}`);
                
                logger.info(`[PIPELINE STAGE 6] Broadcasting session_state to all participants. Client count: ${room.clients.size}`);
                broadcast(sessionId, { type: "session_state", state: roomState });
                logger.info(`[PIPELINE STAGE 6] Broadcast completed.`);
                
                if (paceKind === "self_paced") {
                  for (const [clientWs, pMeta] of room.clients) {
                    if (pMeta.participantId) {
                      const playerState = await sendParticipantState(sessionId, pMeta.participantId);
                      clientWs.send(JSON.stringify({ type: "participant_state", state: playerState }));
                    }
                  }
                } else {
                  await sendSessionState(sessionId);
                }
                broadcast(sessionId, { type: "session_started" });
                logger.info(`[LIVE DEBUG] Question broadcasted successfully. Timer started.`);
              } catch (err: any) {
                logger.error(`[LIVE DEBUG] Error in delayed startSession: ${err?.message || err}. File: liveSessionServer.ts, Line: 701`);
              }
            }, 3000);
            
            break;
          }

          case "host:next_question": {
            if (!clientMeta.isHost) return;
            logger.info(`[NEXT QUESTION STAGE 2] Received host:next_question from host for sessionId=${sessionId}`);
            const paceKind = await resolveSessionPaceKind(sessionId);
            logger.info(`[NEXT QUESTION STAGE 2] paceKind=${paceKind}`);
            if (paceKind === "self_paced") {
              logger.info(`[NEXT QUESTION STAGE 2] Session is self_paced, ignoring host:next_question`);
              break;
            }

            const currentSession = await prisma.liveSession.findUnique({
              where: { id: sessionId },
              select: { settings: true, currentQuestionIndex: true }
            });
            const oldIndex = currentSession?.currentQuestionIndex ?? 0;
            logger.info(`[NEXT QUESTION STAGE 2] currentQuestionIndex BEFORE=${oldIndex}`);
            const settings = currentSession?.settings ? (currentSession.settings as any) : {};
            
            await saveLeaderboardSnapshot(sessionId, currentSession?.currentQuestionIndex ?? 0);
            
            if (settings.countdownEnabled !== false) {
              const nextIndex = (currentSession?.currentQuestionIndex ?? 0) + 1;
              const payload = {
                type: "question_countdown",
                questionIndex: nextIndex,
                duration: 3,
              };
              logger.info(`[LIVE DEBUG] Emitting/broadcasting question_countdown: ${JSON.stringify(payload)}`);
              broadcast(sessionId, payload);
              
              setTimeout(async () => {
                try {
                  logger.info(`[NEXT QUESTION STAGE 3] Timeout complete. Calling advanceQuestion().`);
                  const result = await advanceQuestion(sessionId, auth.userId, auth.role);
                  logger.info(`[NEXT QUESTION STAGE 3] advanceQuestion() completed. Result type=${"finalLeaderboard" in result ? "finished" : "advanced"}`);
                  if ("finalLeaderboard" in result) {
                    logger.info(`[NEXT QUESTION STAGE 3] Final leaderboard reached, broadcasting session_finished`);
                    broadcast(sessionId, { type: "session_finished", leaderboard: result.finalLeaderboard });
                  } else {
                    logger.info(`[NEXT QUESTION STAGE 4] Verifying database update...`);
                    const verifySession = await prisma.liveSession.findUnique({
                      where: { id: sessionId },
                      select: { currentQuestionIndex: true }
                    });
                    logger.info(`[NEXT QUESTION STAGE 4] Database currentQuestionIndex AFTER=${verifySession?.currentQuestionIndex}`);

                    logger.info(`[NEXT QUESTION STAGE 5] Calling sendSessionState()...`);
                    const state = await sendSessionState(sessionId);
                    logger.info(`[NEXT QUESTION STAGE 5] sendSessionState() returned state:`, {
                      status: state.status,
                      currentQuestionIndex: state.currentQuestionIndex,
                      hasCurrentQuestion: !!state.currentQuestion,
                      currentQuestionId: state.currentQuestion?.id
                    });

                    logger.info(`[NEXT QUESTION STAGE 6] Broadcasting question_advanced to all participants`);
                    broadcast(sessionId, { type: "question_advanced" });
                  }
                } catch (err) {
                  logger.error(`[NEXT QUESTION STAGE 3] Error advancing question: ${err}`);
                }
              }, 3000);
            } else {
              const result = await advanceQuestion(sessionId, auth.userId, auth.role);
              if ("finalLeaderboard" in result) {
                broadcast(sessionId, { type: "session_finished", leaderboard: result.finalLeaderboard });
              } else {
                await sendSessionState(sessionId);
                broadcast(sessionId, { type: "question_advanced" });
              }
            }
            break;
          }

          case "host:update_settings": {
            if (!clientMeta.isHost) return;
            const { settings } = msg as any;
            const currentSession = await prisma.liveSession.findUnique({
              where: { id: sessionId },
              select: { settings: true }
            });
            const prevSettings = currentSession?.settings ? (currentSession.settings as any) : {};
            const mergedSettings = { ...prevSettings, ...settings };
            const cameraEnabled = mergedSettings.cameraRequired ?? false;
            
            await prisma.liveSession.update({
              where: { id: sessionId },
              data: {
                settings: mergedSettings,
                cameraEnabled,
              },
            });
            
            broadcast(sessionId, {
              type: "settings_updated",
              settings: mergedSettings,
            });
            break;
          }

          case "host:finish": {
            if (!clientMeta.isHost) return;
            const { finalLeaderboard } = await finishSession(sessionId, auth.userId, auth.role);
            await sendSessionState(sessionId);
            broadcast(sessionId, { type: "session_finished", leaderboard: finalLeaderboard });
            break;
          }

          default:
            break;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        ws.send(JSON.stringify({ type: "error", message }));
      }
    });

    ws.on("close", async () => {
      room.clients.delete(ws);
      if (meta.participantId) {
        await logSessionEvent(sessionId, "disconnect", meta.participantId);
        await prisma.liveParticipant
          .update({
            where: { id: meta.participantId },
            data: { status: "disconnected", leaveTime: new Date(), lastSeenAt: new Date() },
          })
          .catch(() => {});
        broadcast(sessionId, { type: "participant_left", participantId: meta.participantId });
      }
      if (room.clients.size === 0) {
        rooms.delete(sessionId);
      }
    });
  });

  logger.info("Live Session WebSocket server running on /live-sessions/ws/*");
}

export { broadcast as broadcastToLiveSession, sendSessionState as refreshLiveSessionState };
