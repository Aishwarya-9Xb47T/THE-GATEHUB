/**
 * V6 Part 3 — Anonymized quality metrics for continuous improvement.
 */
import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";

export interface QualityMetricRecord {
  recordedAt: string;
  courseSubject: string;
  lessonCount: number;
  overallScore: number;
  publishReady: boolean;
  dimensions: Record<string, number>;
  anonymizedId: string;
}

const METRICS_DIR = process.env.AI_ARCHITECT_METRICS_DIR || join(process.cwd(), "data", "architect-metrics");

function hashSubject(subject: string): string {
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) >>> 0;
  return `course-${h.toString(16)}`;
}

export async function recordQualityMetrics(
  record: {
    subject: string;
    lessonCount: number;
    overallScore: number;
    publishReady: boolean;
    dimensions: Record<string, number>;
  }
): Promise<void> {
  try {
    await mkdir(METRICS_DIR, { recursive: true });
    const entry: QualityMetricRecord = {
      recordedAt: new Date().toISOString(),
      courseSubject: "[redacted]",
      lessonCount: record.lessonCount,
      overallScore: record.overallScore,
      publishReady: record.publishReady,
      dimensions: record.dimensions,
      anonymizedId: hashSubject(record.subject),
    };
    const file = join(METRICS_DIR, `${entry.anonymizedId}-${Date.now()}.json`);
    await writeFile(file, JSON.stringify(entry), "utf8");
  } catch {
    /* non-blocking */
  }
}

export async function loadRecentMetrics(limit = 20): Promise<QualityMetricRecord[]> {
  try {
    const { readdir } = await import("fs/promises");
    const files = (await readdir(METRICS_DIR)).filter((f) => f.endsWith(".json")).sort().reverse();
    const records: QualityMetricRecord[] = [];
    for (const f of files.slice(0, limit)) {
      const raw = await readFile(join(METRICS_DIR, f), "utf8");
      records.push(JSON.parse(raw) as QualityMetricRecord);
    }
    return records;
  } catch {
    return [];
  }
}
