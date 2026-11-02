-- AlterTable: Add instructor approval columns idempotently
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instructor_approval_status" TEXT DEFAULT 'PENDING';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instructor_approved_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instructor_approved_by_id" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instructor_approval_notes" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instructor_rejection_reason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_instructor_approval_status_idx" ON "User"("instructor_approval_status");

-- AddForeignKey safely
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_instructor_approved_by_id_fkey"
    FOREIGN KEY ("instructor_approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Safe grandfathering for existing instructors who already authored courses, learning universes, or latex projects
-- Correct PostgreSQL snake_case column names: Course.instructor_id, LearningUniverse.instructor_id, LatexProject.owner_id
UPDATE "User"
SET "instructor_approval_status" = 'APPROVED',
    "instructor_approved_at" = NOW(),
    "instructor_approval_notes" = 'Grandfathered existing instructor'
WHERE "role" = 'instructor'
  AND (
    "id" IN (SELECT DISTINCT "instructor_id" FROM "Course" WHERE "instructor_id" IS NOT NULL)
    OR "id" IN (SELECT DISTINCT "instructor_id" FROM "LearningUniverse" WHERE "instructor_id" IS NOT NULL)
    OR "id" IN (SELECT DISTINCT "owner_id" FROM "LatexProject" WHERE "owner_id" IS NOT NULL)
  );

-- Admins and super admins have permanent course management permission
UPDATE "User"
SET "instructor_approval_status" = 'APPROVED'
WHERE "role" IN ('admin', 'super_admin');
