/**
 * Learning Overlay Layer — extensible without modifying renderers.
 */

import type { ComponentType } from "react";
import type { AssessmentMode } from "./index";
import type { RendererContext } from "./renderer";
import type { SanitizedQuestionSnapshot } from "./index";

export type OverlayPosition = "toolbar" | "floating" | "sidebar" | "bottom";

export interface OverlayProps {
  question: SanitizedQuestionSnapshot | null;
  ctx: RendererContext;
  isOpen: boolean;
  onClose: () => void;
  onAction?: (action: string, payload?: unknown) => void;
}

export type OverlayComponent = ComponentType<OverlayProps>;

export interface OverlayPlugin {
  id: string;
  label: string;
  icon?: string;
  position: OverlayPosition;
  /** Modes where overlay is available; omit = all modes */
  enabledModes?: AssessmentMode[];
  /** Assessment modes where overlay is on by default */
  defaultEnabledModes?: AssessmentMode[];
  priority?: number;
  Component: OverlayComponent;
}

export interface OverlayState {
  enabledOverlays: Set<string>;
  openOverlayId: string | null;
}
