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
import {
  collectSourceRelatives,
  isCompatiblePptxContentType,
  isValidPptxBuffer,
  relativeFromSourceUrl,
} from "../services/classroomStudio/classroomSourceResolver.js";

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

run("source key resolution", () => {
  const id = "cmsyrby060001ttlabj9g4fmw";
  const relatives = collectSourceRelatives(id, `/uploads/classroom/${id}/source/original.pptx`);
  assert.ok(relatives[0] === `classroom/${id}/source/original.pptx` || relatives.includes(`classroom/${id}/source/original.pptx`));
  assert.ok(relatives.includes(`classroom-studio/${id}/source/original.pptx`));
  assert.equal(relativeFromSourceUrl(`/uploads/classroom/${id}/source/original.pptx`, id), `classroom/${id}/source/original.pptx`);
  assert.equal(relativeFromSourceUrl("/uploads/videos/other.mp4", id), null);
});

run("missing source candidate keys", () => {
  const id = "missing-pres";
  const relatives = collectSourceRelatives(id, null);
  assert.ok(relatives.includes(`classroom/${id}/source/original.pptx`));
  assert.ok(relatives.includes(`classroom-studio/${id}/source/original.pptx`));
  assert.equal(relatives.length <= 8, true);
});

run("PPTX magic bytes and MIME", () => {
  assert.equal(isValidPptxBuffer(Buffer.from("PK\u0003\u0004xxxx")), true);
  assert.equal(isValidPptxBuffer(Buffer.from("<html>")), false);
  assert.equal(isValidPptxBuffer(Buffer.from("{}")), false);
  assert.equal(isValidPptxBuffer(Buffer.alloc(0)), false);
  assert.equal(isCompatiblePptxContentType("application/vnd.openxmlformats-officedocument.presentationml.presentation"), true);
  assert.equal(isCompatiblePptxContentType("application/json"), false);
  assert.equal(isCompatiblePptxContentType("text/html"), false);
});

console.info("classroom asset assertions passed");
