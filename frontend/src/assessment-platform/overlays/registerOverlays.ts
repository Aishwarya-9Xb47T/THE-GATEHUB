import { registerOverlay } from "../registry/overlayRegistry";
import { AiHintOverlay } from "./AiHintOverlay";
import { CalculatorOverlay } from "./CalculatorOverlay";
import { BookmarkOverlay } from "./BookmarkOverlay";
import { createStubOverlay } from "./StubOverlay";
import type { OverlayPosition } from "../types/overlay";
import type { AssessmentMode } from "../types";

const OVERLAY_STUBS: Array<{ id: string; label: string; position: OverlayPosition; enabledModes?: AssessmentMode[] }> = [
  { id: "ai_tutor", label: "AI Tutor", position: "sidebar", enabledModes: ["coding_assessment", "adaptive"] },
  { id: "formula_sheet", label: "Formula Sheet", position: "sidebar" },
  { id: "notes_panel", label: "Notes", position: "sidebar" },
  { id: "scratch_pad", label: "Scratch Pad", position: "floating" },
  { id: "report_issue", label: "Report Issue", position: "toolbar" },
  { id: "translate", label: "Translate", position: "toolbar" },
  { id: "read_aloud", label: "Read Aloud", position: "toolbar" },
  { id: "accessibility", label: "Accessibility", position: "toolbar" },
];

export function registerBuiltinOverlays(): void {
  registerOverlay({
    id: "ai_hint",
    label: "Hint",
    position: "toolbar",
    defaultEnabledModes: ["practice", "adaptive"],
    priority: 10,
    Component: AiHintOverlay,
  });

  registerOverlay({
    id: "calculator",
    label: "Calculator",
    position: "toolbar",
    enabledModes: ["homework", "assignment", "mock_test", "timed_assessment"],
    defaultEnabledModes: ["homework", "mock_test"],
    priority: 20,
    Component: CalculatorOverlay,
  });

  registerOverlay({
    id: "bookmark",
    label: "Bookmark",
    position: "toolbar",
    defaultEnabledModes: ["practice", "homework"],
    priority: 30,
    Component: BookmarkOverlay,
  });

  for (const stub of OVERLAY_STUBS) {
    registerOverlay({
      id: stub.id,
      label: stub.label,
      position: stub.position,
      enabledModes: stub.enabledModes,
      Component: createStubOverlay(stub.label),
    });
  }
}
