/**
 * Download and persist Google Workspace media (Forms images, etc.) into /uploads.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { GoogleOAuthTokens } from './googleOAuth.js';

const GOOGLE_HOSTS = ['googleusercontent.com', 'google.com', 'gstatic.com', 'ggpht.com'];

function isGoogleHostedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return GOOGLE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function extensionFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('svg')) return 'svg';
  return 'jpg';
}

/**
 * Download a remote image and persist under /uploads. Returns relative URL or undefined.
 */
export async function persistGoogleMediaUrl(
  remoteUrl: string | undefined,
  tokens?: GoogleOAuthTokens,
): Promise<string | undefined> {
  if (!remoteUrl || typeof remoteUrl !== 'string') return undefined;
  const trimmed = remoteUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) {
    return trimmed.startsWith('data:image/') ? undefined : undefined;
  }
  if (trimmed.startsWith('/uploads/')) return trimmed;

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'GateHub/1.0',
    };
    if (tokens?.access_token && isGoogleHostedUrl(trimmed)) {
      headers.Authorization = `Bearer ${tokens.access_token}`;
    }

    const res = await fetch(trimmed, { redirect: 'follow', headers });
    if (!res.ok) {
      console.warn('[googleMediaService] Download failed', trimmed, res.status);
      return undefined;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      console.warn('[googleMediaService] Not an image:', contentType, trimmed);
      return undefined;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 32) return undefined;

    const ext = extensionFromContentType(contentType);
    const filename = `google-import-${randomUUID()}.${ext}`;
    const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
    if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
    const localPath = path.join(uploadRoot, filename);
    fs.writeFileSync(localPath, buffer);

    const { persistGeneratedFile } = await import('../../middlewares/persistUpload.js');
    const publicPath = await persistGeneratedFile({
      localPath,
      prefix: 'images',
      fileName: filename,
      contentType,
    });
    console.log('[googleMediaService] Persisted Google media:', publicPath, `(${buffer.length} bytes)`);
    return publicPath;
  } catch (err) {
    console.warn('[googleMediaService] Failed to persist media:', trimmed, err);
    return undefined;
  }
}

export async function persistGoogleMediaBatch(
  urls: Array<string | undefined>,
  tokens?: GoogleOAuthTokens,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const url of urls) {
    if (!url || map.has(url)) continue;
    const persisted = await persistGoogleMediaUrl(url, tokens);
    if (persisted) map.set(url, persisted);
  }
  return map;
}
