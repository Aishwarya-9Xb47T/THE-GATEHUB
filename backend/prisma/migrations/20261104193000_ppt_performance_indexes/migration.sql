-- Performance compound indexes for hierarchical study materials querying
-- Created safely with IF NOT EXISTS to guarantee zero downtime and backward-compatibility

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ppt_subtopics_topic_id_is_active_idx" ON "ppt_subtopics"("topic_id", "is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ppt_subtopics_topic_id_display_order_idx" ON "ppt_subtopics"("topic_id", "display_order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ppt_resources_topic_id_status_idx" ON "ppt_resources"("topic_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ppt_resources_subtopic_id_status_idx" ON "ppt_resources"("subtopic_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ppt_resources_status_created_at_idx" ON "ppt_resources"("status", "created_at");

