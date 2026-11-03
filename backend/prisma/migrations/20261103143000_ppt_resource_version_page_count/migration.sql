-- AlterTable
ALTER TABLE "ppt_resource_versions" ADD COLUMN IF NOT EXISTS "page_count" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ppt_resource_versions_file_type_idx" ON "ppt_resource_versions"("file_type");

