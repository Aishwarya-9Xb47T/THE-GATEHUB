/**
 * Jest OOMs on this machine when it scans backend/src. This script runs the same
 * classroom asset assertions with tsx instead.
 */
import assert from "node:assert/strict";
import {
  CLASSROOM_SOURCE_REST,
  PPTX_MIME,
  SVG_MIME,
  canonicalPublicPath,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
  parseClassroomAssetFilename,
  sanitizeClassroomAssetRest,
  classroomStorageRelatives,
} from "../services/classroomStudio/classroomAssetPath.js";
import { classroomAssetLookupRelatives } from "../services/classroomStudio/classroomAssetUrls.js";
import { classroomAssetAccessDecision } from "../services/classroomStudio/classroomAssetAccess.js";
import { mimeFromUploadPath } from "../utils/uploadMedia.js";

function run(name: string, fn: () => void) {
  fn();
  console.info(`ok  ${name}`);
}

run("canonical storage keys", () => {
  assert.equal(canonicalSourceRelative("pres-1"), "classroom/pres-1/source/original.pptx");
  assert.equal(canonicalSlideSvgRelative("pres-1", 2), "classroom/pres-1/renders/slide-002.svg");
  assert.deepEqual(classroomStorageRelatives("pres-1", CLASSROOM_SOURCE_REST), [
    "classroom/pres-1/source/original.pptx",
    "classroom-studio/pres-1/source/original.pptx",
  ]);
});

run("path traversal rejected", () => {
  assert.equal(sanitizeClassroomAssetRest("../secrets.pptx"), null);
  assert.equal(parseClassroomAssetFilename("renders", "../slide-001.svg"), null);
  assert.equal(parseClassroomAssetFilename("source", "notes.pdf"), null);
});

run("asset filename parsing", () => {
  assert.deepEqual(parseClassroomAssetFilename("source", "original.pptx"), {
    rest: "source/original.pptx",
    mime: PPTX_MIME,
  });
  assert.deepEqual(parseClassroomAssetFilename("renders", "slide-2.svg"), {
    rest: "renders/slide-002.svg",
    mime: SVG_MIME,
  });
});

run("legacy lookup aliases", () => {
  const keys = classroomAssetLookupRelatives("classroom/pres-1/renders/slide-2.svg");
  assert.ok(keys.includes("classroom/pres-1/renders/slide-002.svg"));
  assert.ok(keys.includes("classroom-studio/pres-1/renders/slide-2.svg"));
});

run("existing presentation repair contract", () => {
  const presentationId = "cmsy6g8sr00b7owbuj0gvy1rb";
  assert.equal(
    canonicalSourceRelative(presentationId),
    "classroom/cmsy6g8sr00b7owbuj0gvy1rb/source/original.pptx",
  );
  assert.equal(
    canonicalPublicPath(canonicalSlideSvgRelative(presentationId, 2)),
    "/uploads/classroom/cmsy6g8sr00b7owbuj0gvy1rb/renders/slide-002.svg",
  );
});

run("authorization", () => {
  assert.equal(
    classroomAssetAccessDecision({
      userId: "inst-1",
      role: "instructor",
      instructorId: "inst-1",
      isParticipant: false,
    }),
    true,
  );
  assert.equal(
    classroomAssetAccessDecision({
      userId: "stu-1",
      role: "student",
      instructorId: "inst-1",
      isParticipant: true,
    }),
    true,
  );
  assert.equal(
    classroomAssetAccessDecision({
      userId: "stranger",
      role: "student",
      instructorId: "inst-1",
      isParticipant: false,
    }),
    false,
  );
});

run("upload MIME", () => {
  assert.equal(mimeFromUploadPath("renders/slide-002.svg"), "image/svg+xml");
  assert.equal(
    mimeFromUploadPath("source/original.pptx"),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
});

console.info("classroom asset assertions passed");
