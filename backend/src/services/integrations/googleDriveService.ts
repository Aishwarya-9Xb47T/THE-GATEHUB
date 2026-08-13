import { getGoogleAccessToken } from "./googleOAuthService.js";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export interface DriveSyncResult {
  fileId: string;
  name: string;
  webViewLink?: string;
}

export async function syncJsonToDrive(
  userId: string,
  fileName: string,
  payload: unknown,
  existingFileId?: string | null
): Promise<DriveSyncResult | null> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return null;

  const body = JSON.stringify(payload, null, 2);
  const metadata = {
    name: fileName.endsWith(".json") ? fileName : `${fileName}.json`,
    mimeType: "application/json",
  };

  if (existingFileId) {
    const res = await fetch(`${DRIVE_UPLOAD}/${existingFileId}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string; name: string; webViewLink?: string };
    return { fileId: data.id, name: data.name, webViewLink: data.webViewLink };
  }

  const boundary = `gatehub-${Date.now()}`;
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

  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; name: string; webViewLink?: string };
  return { fileId: data.id, name: data.name, webViewLink: data.webViewLink };
}

export async function downloadDriveJson(userId: string, fileId: string): Promise<unknown | null> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return null;

  const res = await fetch(`${DRIVE_FILES}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}
