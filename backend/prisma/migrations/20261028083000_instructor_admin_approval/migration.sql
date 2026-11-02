-- AlterTable
ALTER TABLE "User" ADD COLUMN "instructor_approval_status" TEXT DEFAULT 'PENDING';
ALTER TABLE "User" ADD COLUMN "instructor_approved_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "instructor_approved_by_id" TEXT;
ALTER TABLE "User" ADD COLUMN "instructor_approval_notes" TEXT;
ALTER TABLE "User" ADD COLUMN "instructor_rejection_reason" TEXT;

-- CreateIndex
CREATE INDEX "User_instructor_approval_status_idx" ON "User"("instructor_approval_status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_instructor_approved_by_id_fkey" FOREIGN KEY ("instructor_approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Safe grandfathering for existing instructors who already authored courses or content
UPDATE "User"
SET "instructor_approval_status" = 'APPROVED',
    "instructor_approved_at" = NOW(),
    "instructor_approval_notes" = 'Grandfathered existing instructor'
WHERE "role" = 'instructor'
  AND (
    "id" IN (SELECT DISTINCT "instructorId" FROM "Course")
    OR "id" IN (SELECT DISTINCT "instructorId" FROM "LearningUniverse")
    OR "id" IN (SELECT DISTINCT "ownerId" FROM "LatexProject")
  );

-- Admins and super admins have permanent course management permission
UPDATE "User"
SET "instructor_approval_status" = 'APPROVED'
WHERE "role" IN ('admin', 'super_admin');
