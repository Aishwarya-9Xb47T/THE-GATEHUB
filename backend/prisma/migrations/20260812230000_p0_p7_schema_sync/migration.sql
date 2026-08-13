-- AlterTable
ALTER TABLE "LiveAnswer" ADD COLUMN     "is_first_correct" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_last_correct" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marks_earned" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "question_snapshot" JSONB,
ADD COLUMN     "streak_at" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp_earned" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LiveParticipant" ADD COLUMN     "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "answer_speed" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "avatar_category" TEXT,
ADD COLUMN     "battery_status" TEXT,
ADD COLUMN     "browser" TEXT,
ADD COLUMN     "camera_on" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "current_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "device" TEXT,
ADD COLUMN     "fullscreen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "join_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "leave_time" TIMESTAMP(3),
ADD COLUMN     "lives" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "mic_on" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "network_status" TEXT NOT NULL DEFAULT 'good',
ADD COLUMN     "powerups" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "prev_rank" INTEGER,
ADD COLUMN     "raised_hand" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rank_change" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tab_focused" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "violation_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "camera_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chat_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leaderboard_hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_participants" INTEGER NOT NULL DEFAULT 250;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "bloom_level" TEXT,
ADD COLUMN     "hint" TEXT,
ADD COLUMN     "negative_marks" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reference_links" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "auth_provider" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN     "google_access_token" TEXT,
ADD COLUMN     "google_email" TEXT,
ADD COLUMN     "google_id" TEXT,
ADD COLUMN     "google_refresh_token" TEXT,
ADD COLUMN     "google_token_expiry" TIMESTAMP(3),
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LiveSessionEvent" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "participant_id" TEXT,
    "event_type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "LiveSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicTrack" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "upload_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT,
    "storage_key" TEXT NOT NULL,

    CONSTRAINT "MusicTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_type" TEXT NOT NULL,
    "source_url" TEXT,
    "thumbnail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "instructor_id" TEXT NOT NULL,
    "course_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slide" (
    "id" TEXT NOT NULL,
    "presentation_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB,
    "thumbnail" TEXT,
    "notes" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Slide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "slide_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "question" TEXT,
    "options" JSONB,
    "settings" JSONB,
    "duration" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomSession" (
    "id" TEXT NOT NULL,
    "presentation_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "title" TEXT,
    "room_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "current_slide_id" TEXT,
    "active_interaction_id" TEXT,
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomParticipant" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'online',
    "device" TEXT,
    "browser" TEXT,
    "raised_hand" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClassroomParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionResponse" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "interaction_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "duration" INTEGER,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_correct" BOOLEAN,
    "points_awarded" INTEGER,

    CONSTRAINT "InteractionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomSessionAnalytics" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "total_participants" INTEGER NOT NULL,
    "active_participants" INTEGER NOT NULL,
    "total_responses" INTEGER NOT NULL,
    "average_response_time" DOUBLE PRECISION,
    "participation_rate" DOUBLE PRECISION,
    "accuracy_rate" DOUBLE PRECISION,
    "engagement_score" DOUBLE PRECISION,
    "most_engaged_slide" TEXT,
    "least_engaged_slide" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomSessionAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentQuestion" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentChatMessage" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'student',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveSessionEvent_session_id_idx" ON "LiveSessionEvent"("session_id");

-- CreateIndex
CREATE INDEX "LiveSessionEvent_timestamp_idx" ON "LiveSessionEvent"("timestamp");

-- CreateIndex
CREATE INDEX "MusicTrack_uploader_id_idx" ON "MusicTrack"("uploader_id");

-- CreateIndex
CREATE INDEX "Presentation_instructor_id_idx" ON "Presentation"("instructor_id");

-- CreateIndex
CREATE INDEX "Presentation_course_id_idx" ON "Presentation"("course_id");

-- CreateIndex
CREATE INDEX "Presentation_status_idx" ON "Presentation"("status");

-- CreateIndex
CREATE INDEX "Slide_presentation_id_idx" ON "Slide"("presentation_id");

-- CreateIndex
CREATE INDEX "Slide_order_idx" ON "Slide"("order");

-- CreateIndex
CREATE UNIQUE INDEX "Slide_presentation_id_order_key" ON "Slide"("presentation_id", "order");

-- CreateIndex
CREATE INDEX "Interaction_slide_id_idx" ON "Interaction"("slide_id");

-- CreateIndex
CREATE INDEX "Interaction_type_idx" ON "Interaction"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomSession_room_code_key" ON "ClassroomSession"("room_code");

-- CreateIndex
CREATE INDEX "ClassroomSession_instructor_id_idx" ON "ClassroomSession"("instructor_id");

-- CreateIndex
CREATE INDEX "ClassroomSession_presentation_id_idx" ON "ClassroomSession"("presentation_id");

-- CreateIndex
CREATE INDEX "ClassroomSession_room_code_idx" ON "ClassroomSession"("room_code");

-- CreateIndex
CREATE INDEX "ClassroomSession_status_idx" ON "ClassroomSession"("status");

-- CreateIndex
CREATE INDEX "ClassroomParticipant_session_id_idx" ON "ClassroomParticipant"("session_id");

-- CreateIndex
CREATE INDEX "ClassroomParticipant_user_id_idx" ON "ClassroomParticipant"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomParticipant_session_id_user_id_key" ON "ClassroomParticipant"("session_id", "user_id");

-- CreateIndex
CREATE INDEX "InteractionResponse_session_id_idx" ON "InteractionResponse"("session_id");

-- CreateIndex
CREATE INDEX "InteractionResponse_interaction_id_idx" ON "InteractionResponse"("interaction_id");

-- CreateIndex
CREATE INDEX "InteractionResponse_participant_id_idx" ON "InteractionResponse"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomSessionAnalytics_session_id_key" ON "ClassroomSessionAnalytics"("session_id");

-- CreateIndex
CREATE INDEX "ClassroomSessionAnalytics_session_id_idx" ON "ClassroomSessionAnalytics"("session_id");

-- CreateIndex
CREATE INDEX "StudentQuestion_session_id_idx" ON "StudentQuestion"("session_id");

-- CreateIndex
CREATE INDEX "StudentQuestion_user_id_idx" ON "StudentQuestion"("user_id");

-- CreateIndex
CREATE INDEX "StudentChatMessage_session_id_idx" ON "StudentChatMessage"("session_id");

-- CreateIndex
CREATE INDEX "StudentChatMessage_user_id_idx" ON "StudentChatMessage"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_google_id_key" ON "User"("google_id");

-- AddForeignKey
ALTER TABLE "LiveSessionEvent" ADD CONSTRAINT "LiveSessionEvent_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicTrack" ADD CONSTRAINT "MusicTrack_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_slide_id_fkey" FOREIGN KEY ("slide_id") REFERENCES "Slide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomSession" ADD CONSTRAINT "ClassroomSession_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "Presentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomSession" ADD CONSTRAINT "ClassroomSession_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomParticipant" ADD CONSTRAINT "ClassroomParticipant_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomParticipant" ADD CONSTRAINT "ClassroomParticipant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionResponse" ADD CONSTRAINT "InteractionResponse_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionResponse" ADD CONSTRAINT "InteractionResponse_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "Interaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionResponse" ADD CONSTRAINT "InteractionResponse_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "ClassroomParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomSessionAnalytics" ADD CONSTRAINT "ClassroomSessionAnalytics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestion" ADD CONSTRAINT "StudentQuestion_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestion" ADD CONSTRAINT "StudentQuestion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentChatMessage" ADD CONSTRAINT "StudentChatMessage_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentChatMessage" ADD CONSTRAINT "StudentChatMessage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
