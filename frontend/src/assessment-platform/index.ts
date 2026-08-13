/**
 * Universal Assessment Platform — public API (Module 05).
 */

export * from "./types";
export * from "./types/renderer";
export * from "./types/response";
export * from "./types/overlay";
export * from "./types/modeConfig";

export { bootstrapAssessmentPlatform, isAssessmentPlatformBootstrapped } from "./bootstrap";

export { registerRenderer, getRenderer, loadRenderer, hasRenderer, listRenderers } from "./registry/rendererRegistry";
export { registerOverlay, getOverlay, listOverlays, listOverlaysForMode } from "./registry/overlayRegistry";

export { AssessmentPlayer } from "./components/player/AssessmentPlayer";
export { QuestionHost } from "./components/player/QuestionHost";

export { createThemeEngine } from "./services/themeEngine";
export { createAnimationService } from "./services/animationService";
export { createAudioService } from "./services/audioService";
export { createPlayerEventBus } from "./services/playerEventBus";
export { createPerformanceMonitor } from "./services/performanceMonitor";

export { getModeConfig, mergeModeSettings, MODE_PRESETS } from "./types/modeConfig";
export { createRendererResponse, toAttemptPayload } from "./types/response";
