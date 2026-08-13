import { downloadCompleteLearningUniverse } from "../controllers/enhancedCourseDownloadController.js";
import { prisma } from "../utils/prisma.js";
import { Writable } from "stream";
import fs from "fs";
import path from "path";

class MockResponse extends Writable {
  statusCode: number = 200;
  headers: Record<string, string> = {};

  constructor(private fileStream: fs.WriteStream) {
    super();
  }

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  send(body: any) {
    this.fileStream.write(body);
    this.end();
  }

  json(data: any) {
    this.fileStream.write(JSON.stringify(data));
    this.end();
  }

  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void) {
    this.fileStream.write(chunk, encoding, callback);
  }

  _final(callback: (error?: Error | null) => void) {
    this.fileStream.end(callback);
  }
}

async function runLUTest() {
  console.log("=== RUNNING LU OFFLINE DOWNLOAD SYSTEM TEST ===");
  
  // Find Deep Learning universe ID (or first universe)
  const lu = await prisma.learningUniverse.findFirst({
    where: { title: "Deep Learning" },
    select: { id: true, instructorId: true }
  });

  if (!lu) {
    console.error("Deep Learning universe not found in database.");
    return;
  }

  console.log(`Found LU ID: ${lu.id}, Instructor ID: ${lu.instructorId}`);
  const zipPath = path.join(process.cwd(), "test-download-lu.zip");
  
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const fileWriteStream = fs.createWriteStream(zipPath);
  const req: any = {
    params: { id: lu.id },
    user: { id: lu.instructorId, role: "instructor" }
  };
  const res: any = new MockResponse(fileWriteStream);

  try {
    await downloadCompleteLearningUniverse(req, res);
    await new Promise<void>((resolve, reject) => {
      fileWriteStream.on("finish", resolve);
      fileWriteStream.on("error", reject);
      res.on("finish", resolve);
      res.on("error", reject);
    });
    console.log("LU ZIP generation complete successfully!");
  } catch (err) {
    console.error("LU ZIP generation failed with error:", err);
  }
}

runLUTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
