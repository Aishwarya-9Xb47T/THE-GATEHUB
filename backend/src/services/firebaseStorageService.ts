import { randomUUID } from "crypto";
import admin from "firebase-admin";

let initialized = false;

export interface BannerStorageRecord {
  bannerId: string;
  bannerUrl: string;
  thumbnailUrl: string;
  source: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

function getServiceAccount(): admin.ServiceAccount | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      return JSON.parse(json) as admin.ServiceAccount;
    } catch {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
    }
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    return null; // admin SDK auto-loads from GOOGLE_APPLICATION_CREDENTIALS
  }
  return null;
}

export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.FIREBASE_STORAGE_BUCKET &&
    (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS)
  );
}

function ensureFirebase(): admin.app.App | null {
  if (!isFirebaseConfigured()) return null;
  if (initialized) return admin.app();

  const cred = getServiceAccount();
  if (cred) {
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else {
    admin.initializeApp({
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }
  initialized = true;
  return admin.app();
}

export async function uploadBannerToFirebase(
  bannerBuffer: Buffer,
  thumbBuffer: Buffer,
  meta: { source: string; category?: string; ext?: string }
): Promise<BannerStorageRecord | null> {
  const app = ensureFirebase();
  if (!app) return null;

  const bannerId = randomUUID();
  const ext = meta.ext || ".jpg";
  const now = new Date().toISOString();
  const bucket = admin.storage().bucket();
  const bannerPath = `course-banners/${bannerId}/banner${ext}`;
  const thumbPath = `course-banners/${bannerId}/thumb${ext}`;

  const bannerFile = bucket.file(bannerPath);
  const thumbFile = bucket.file(thumbPath);

  await bannerFile.save(bannerBuffer, {
    metadata: { contentType: ext === ".png" ? "image/png" : "image/jpeg", cacheControl: "public, max-age=31536000" },
  });
  await thumbFile.save(thumbBuffer, {
    metadata: { contentType: ext === ".png" ? "image/png" : "image/jpeg", cacheControl: "public, max-age=31536000" },
  });

  try {
    await bannerFile.makePublic();
    await thumbFile.makePublic();
  } catch {
    /* bucket may use uniform access — URLs still work if rules allow */
  }

  const bannerUrl = `https://storage.googleapis.com/${bucket.name}/${bannerPath}`;
  const thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`;

  const record: BannerStorageRecord = {
    bannerId,
    bannerUrl,
    thumbnailUrl,
    source: meta.source,
    category: meta.category,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await admin.firestore().collection("course-banners").doc(bannerId).set(record);
  } catch (err) {
    console.warn("Firestore banner metadata save failed (storage URLs still valid):", err);
  }

  return record;
}
