-- AlterTable
ALTER TABLE "ppt_resources" ADD COLUMN IF NOT EXISTS "file_type" TEXT NOT NULL DEFAULT 'pptx';
ALTER TABLE "ppt_resources" ADD COLUMN IF NOT EXISTS "page_count" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ppt_resources_file_type_idx" ON "ppt_resources"("file_type");

-- AlterTable
ALTER TABLE "ppt_resource_versions" ADD COLUMN IF NOT EXISTS "file_type" TEXT NOT NULL DEFAULT 'pptx';
ALTER TABLE "ppt_resource_versions" ADD COLUMN IF NOT EXISTS "page_count" INTEGER;
