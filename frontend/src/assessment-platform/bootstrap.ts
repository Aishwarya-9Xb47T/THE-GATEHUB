/**
 * Bootstrap — register all renderer and overlay plugins at app init.
 */

import { registerBuiltinRenderers } from "./renderers/registerRenderers";
import { registerBuiltinOverlays } from "./overlays/registerOverlays";

let bootstrapped = false;

export function bootstrapAssessmentPlatform(): void {
  if (bootstrapped) return;
  registerBuiltinRenderers();
  registerBuiltinOverlays();
  bootstrapped = true;
}

export function isAssessmentPlatformBootstrapped(): boolean {
  return bootstrapped;
}
