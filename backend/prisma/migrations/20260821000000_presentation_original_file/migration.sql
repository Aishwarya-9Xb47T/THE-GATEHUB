-- Durable original.pptx fallback when object storage is not configured.
CREATE TABLE "PresentationOriginalFile" (
    "presentation_id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationOriginalFile_pkey" PRIMARY KEY ("presentation_id")
);

ALTER TABLE "PresentationOriginalFile" ADD CONSTRAINT "PresentationOriginalFile_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
