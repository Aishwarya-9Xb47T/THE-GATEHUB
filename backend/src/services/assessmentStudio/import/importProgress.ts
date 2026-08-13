export type ImportStage =
  | "uploading"
  | "parsing"
  | "ocr"
  | "ai_extraction"
  | "validation"
  | "media"
  | "saving"
  | "completed"
  | "failed";

export interface ImportProgress {
  stage: ImportStage;
  percent: number;
  message: string;
}

export const STAGE_MESSAGES: Record<ImportStage, string> = {
  uploading: "Uploading contentΓÇª",
  parsing: "Parsing documentΓÇª",
  ocr: "Running OCR on imagesΓÇª",
  ai_extraction: "AI is detecting questions and answersΓÇª",
  validation: "Validating questionsΓÇª",
  media: "Processing mediaΓÇª",
  saving: "Building previewΓÇª",
  completed: "Import complete",
  failed: "Import failed",
};

export function progressPayload(stage: ImportStage, percent: number): ImportProgress {
  return {
    stage,
    percent: Math.min(100, Math.max(0, Math.round(percent))),
    message: STAGE_MESSAGES[stage],
  };
}
