import { getGoogleAccessToken } from "./googleOAuthService.js";

const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export interface NotebookCellInput {
  type: "code" | "markdown";
  source: string;
}

export interface ColabSyncResult {
  fileId: string;
  colabUrl: string;
}

export interface ColabSyncError {
  error: string;
  status?: number;
}

function cellsToIpynb(cells: NotebookCellInput[], language: string) {
  const kernelName = language === "python" || language === "py" ? "python3" : language;
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: kernelName,
        language: language === "py" ? "python" : language,
        name: kernelName,
      },
      language_info: { name: language === "py" ? "python" : language },
    },
    cells: cells.map((cell) => {
      const source = cell.source.endsWith("\n") ? cell.source : `${cell.source}\n`;
      return {
        cell_type: cell.type === "markdown" ? "markdown" : "code",
        metadata: {},
        source: source.split("\n").map((line, i, arr) => (i < arr.length - 1 ? `${line}\n` : line)),
        ...(cell.type === "code" ? { outputs: [], execution_count: null } : {}),
      };
    }),
  };
}

async function driveUpload(
  accessToken: string,
  fileName: string,
  body: string,
  existingFileId?: string | null
): Promise<{ ok: true; fileId: string } | { ok: false; error: string; status: number }> {
  const name = fileName.endsWith(".ipynb") ? fileName : `${fileName}.ipynb`;

  if (existingFileId) {
    const res = await fetch(`${DRIVE_UPLOAD}/${existingFileId}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText || res.statusText, status: res.status };
    }
    return { ok: true, fileId: existingFileId };
  }

  const mimeTypes = ["application/vnd.google.colab", "application/x-ipynb+json", "application/json"];
  for (const mimeType of mimeTypes) {
    const boundary = `gatehub-colab-${Date.now()}`;
    const metadata = { name, mimeType };
    const multipartBody = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      body,
      `--${boundary}--`,
    ].join("\r\n");

    const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (res.ok) {
      const data = (await res.json()) as { id: string };
      return { ok: true, fileId: data.id };
    }

    if (mimeType === mimeTypes[mimeTypes.length - 1]) {
      const errText = await res.text();
      return { ok: false, error: errText || res.statusText, status: res.status };
    }
  }

  return { ok: false, error: "Drive upload failed", status: 500 };
}

export async function syncIpynbToDrive(
  userId: string,
  fileName: string,
  cells: NotebookCellInput[],
  language: string,
  existingFileId?: string | null
): Promise<ColabSyncResult | ColabSyncError> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) {
    return { error: "Google account not connected" };
  }

  const ipynb = cellsToIpynb(cells, language);
  const body = JSON.stringify(ipynb, null, 1);
  const uploaded = await driveUpload(accessToken, fileName, body, existingFileId);

  if (!uploaded.ok) {
    return { error: `Google Drive sync failed: ${uploaded.error}`, status: uploaded.status };
  }

  return {
    fileId: uploaded.fileId,
    colabUrl: `https://colab.research.google.com/drive/${uploaded.fileId}`,
  };
}

export function colabUrlFromDriveFileId(fileId: string): string {
  return `https://colab.research.google.com/drive/${fileId}`;
}

export const COLAB_BLANK_URL = "https://colab.research.google.com/#create=true";
