import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";
import { persistMulterFile } from "../middlewares/persistUpload.js";

export const uploadRouter = Router();

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many uploads. Please wait and try again." },
});

uploadRouter.post("/", authenticate, uploadLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      console.error("Upload failed: No file uploaded");
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    console.log("[VIDEO_UPLOAD_BACKEND] RECEIVED", {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      storedFilename: req.file.filename,
    });

    const url = await persistMulterFile(req.file, undefined, undefined, { keepLocal: true });
    console.log("[VIDEO_UPLOAD_BACKEND] STORED", { url, size: req.file.size });
    console.log("[B2_UPLOAD]", {
      bucket: process.env.B2_BUCKET_NAME || null,
      key: url.replace(/^\/uploads\//, "uploads/").replace(/^\//, ""),
      bytes: req.file.size,
      mimeType: req.file.mimetype,
      status: "ok",
    });
    res.json({ success: true, url });
  } catch (error: any) {
    const { isB2Configured } = await import("../services/b2StorageService.js");
    const b2Configured = isB2Configured();
    console.error("[VIDEO_UPLOAD_BACKEND] FAILED", {
      message: error?.message,
      name: error?.name,
      b2Configured,
      size: req.file?.size,
      mime: req.file?.mimetype,
    });
    res.status(500).json({
      success: false,
      error: !b2Configured
        ? "Persistent storage is not configured. Set B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, and B2_REGION."
        : error?.message?.includes("B2") || error?.message?.includes("HEAD")
          ? "Upload reached the server but failed while saving to persistent storage. Retry the upload."
          : "Upload failed while saving the file. Please retry.",
    });
  }
});

uploadRouter.post("/image", authenticate, uploadLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file uploaded" });
    }

    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ success: false, error: "File must be an image" });
    }

    console.log("Image uploaded successfully:", {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    const url = await persistMulterFile(req.file, "images", undefined, { keepLocal: true });
    res.json({ success: true, url });
  } catch (error: any) {
    console.error("Image upload error:", error);
    const isProd = process.env.NODE_ENV === "production";
    res.status(500).json({
      success: false,
      error: isProd ? "Image upload failed. Please try again." : (error?.message || "Image upload failed"),
    });
  }
});
