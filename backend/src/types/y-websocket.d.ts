declare module "y-websocket/bin/utils" {
  import { WebSocket } from "ws";
  import * as Y from "yjs";
  import { IncomingMessage } from "http";

  export const docs: Map<string, Y.Doc>;
  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    options?: { docName?: string; gc?: boolean }
  ): void;
}
