/**
 * V6 Part 4 — Enterprise compliance (SCORM, xAPI, LTI, Common Cartridge).
 */
import type { ArchitectBlueprint } from "../types.js";

export interface EnterpriseComplianceMeta {
  scorm: { supported: boolean; version: string; packageReady: boolean };
  xapi: { supported: boolean; activityId: string };
  lti: { supported: boolean; version: string };
  commonCartridge: { supported: boolean; version: string };
  aicc: { supported: boolean };
}

export function buildEnterpriseCompliance(blueprint: ArchitectBlueprint): EnterpriseComplianceMeta {
  const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  const activityBase = `https://gatehub.local/courses/${blueprint.courseTitle.replace(/\s+/g, "-").toLowerCase()}`;

  return {
    scorm: { supported: true, version: "2004 4th Edition", packageReady: lessonCount > 0 },
    xapi: { supported: true, activityId: activityBase },
    lti: { supported: true, version: "1.3" },
    commonCartridge: { supported: true, version: "1.3" },
    aicc: { supported: false },
  };
}
