-- AlterTable: ppt_resources: make topic_id and subtopic_id nullable
ALTER TABLE "ppt_resources" ALTER COLUMN "topic_id" DROP NOT NULL;
ALTER TABLE "ppt_resources" ALTER COLUMN "subtopic_id" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "ppt_resources" DROP CONSTRAINT IF EXISTS "ppt_resources_topic_id_fkey";
ALTER TABLE "ppt_resources" DROP CONSTRAINT IF EXISTS "ppt_resources_subtopic_id_fkey";

-- AddForeignKey
ALTER TABLE "ppt_resources" ADD CONSTRAINT "ppt_resources_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "ppt_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ppt_resources" ADD CONSTRAINT "ppt_resources_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "ppt_subtopics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

