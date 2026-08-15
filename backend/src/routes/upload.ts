import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";
import { persistMulterFile } from "../middlewares/persistUpload.js";

export const uploadRouter = Router();

uploadRouter.post("/", authenticate, upload.single("file"), async (req, res) => {
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

    const url = await persistMulterFile(req.file);
    console.log("Generated file URL:", url);
    res.json({ success: true, url });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

uploadRouter.post("/image", authenticate, upload.single("file"), async (req, res) => {
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

    const url = await persistMulterFile(req.file, "images");
    res.json({ success: true, url });
  } catch (error: any) {
    console.error("Image upload error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
