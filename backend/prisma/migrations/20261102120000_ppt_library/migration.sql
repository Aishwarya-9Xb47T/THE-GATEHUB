-- CreateTable: ppt_topics
CREATE TABLE "ppt_topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppt_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ppt_subtopics
CREATE TABLE "ppt_subtopics" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppt_subtopics_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ppt_resources
CREATE TABLE "ppt_resources" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "topic_id" TEXT NOT NULL,
    "subtopic_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "thumbnail_url" TEXT,
    "preview_storage_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "language" TEXT NOT NULL DEFAULT 'en',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "academic_level" TEXT,
    "slide_count" INTEGER,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppt_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ppt_resource_files
CREATE TABLE "ppt_resource_files" (
    "resource_id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppt_resource_files_pkey" PRIMARY KEY ("resource_id")
);

-- CreateTable: ppt_resource_versions
CREATE TABLE "ppt_resource_versions" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "original_file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "change_note" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppt_resource_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ppt_download_logs
CREATE TABLE "ppt_download_logs" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "user_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "downloaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppt_download_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes for ppt_topics
CREATE UNIQUE INDEX "ppt_topics_name_key" ON "ppt_topics"("name");
CREATE UNIQUE INDEX "ppt_topics_slug_key" ON "ppt_topics"("slug");
CREATE INDEX "ppt_topics_slug_idx" ON "ppt_topics"("slug");
CREATE INDEX "ppt_topics_is_active_idx" ON "ppt_topics"("is_active");
CREATE INDEX "ppt_topics_display_order_idx" ON "ppt_topics"("display_order");

-- Indexes for ppt_subtopics
CREATE UNIQUE INDEX "ppt_subtopics_topic_id_name_key" ON "ppt_subtopics"("topic_id", "name");
CREATE UNIQUE INDEX "ppt_subtopics_topic_id_slug_key" ON "ppt_subtopics"("topic_id", "slug");
CREATE INDEX "ppt_subtopics_topic_id_idx" ON "ppt_subtopics"("topic_id");
CREATE INDEX "ppt_subtopics_is_active_idx" ON "ppt_subtopics"("is_active");
CREATE INDEX "ppt_subtopics_display_order_idx" ON "ppt_subtopics"("display_order");

-- Indexes for ppt_resources
CREATE INDEX "ppt_resources_topic_id_idx" ON "ppt_resources"("topic_id");
CREATE INDEX "ppt_resources_subtopic_id_idx" ON "ppt_resources"("subtopic_id");
CREATE INDEX "ppt_resources_instructor_id_idx" ON "ppt_resources"("instructor_id");
CREATE INDEX "ppt_resources_status_idx" ON "ppt_resources"("status");
CREATE INDEX "ppt_resources_published_at_idx" ON "ppt_resources"("published_at");
CREATE INDEX "ppt_resources_created_at_idx" ON "ppt_resources"("created_at");
CREATE INDEX "ppt_resources_download_count_idx" ON "ppt_resources"("download_count");

-- Indexes for ppt_resource_versions
CREATE INDEX "ppt_resource_versions_resource_id_idx" ON "ppt_resource_versions"("resource_id");
CREATE INDEX "ppt_resource_versions_version_number_idx" ON "ppt_resource_versions"("version_number");

-- Indexes for ppt_download_logs
CREATE INDEX "ppt_download_logs_resource_id_idx" ON "ppt_download_logs"("resource_id");
CREATE INDEX "ppt_download_logs_user_id_idx" ON "ppt_download_logs"("user_id");
CREATE INDEX "ppt_download_logs_downloaded_at_idx" ON "ppt_download_logs"("downloaded_at");

-- AddForeignKey
ALTER TABLE "ppt_topics" ADD CONSTRAINT "ppt_topics_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppt_subtopics" ADD CONSTRAINT "ppt_subtopics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "ppt_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppt_subtopics" ADD CONSTRAINT "ppt_subtopics_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppt_resources" ADD CONSTRAINT "ppt_resources_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "ppt_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppt_resources" ADD CONSTRAINT "ppt_resources_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "ppt_subtopics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppt_resources" ADD CONSTRAINT "ppt_resources_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppt_resource_files" ADD CONSTRAINT "ppt_resource_files_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "ppt_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppt_resource_versions" ADD CONSTRAINT "ppt_resource_versions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "ppt_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ppt_resource_versions" ADD CONSTRAINT "ppt_resource_versions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppt_download_logs" ADD CONSTRAINT "ppt_download_logs_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "ppt_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ppt_download_logs" ADD CONSTRAINT "ppt_download_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

