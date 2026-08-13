/**
 * @deprecated Import from `@/assistant` instead.
 * Kept for backward compatibility with existing imports.
 */
import { useGateHubAssistant, useGateHubAssistantOptional, openDocsAssistant } from "@/assistant";

export {
  GateHubAssistantProvider,
  GateHubAssistantRoot,
  openDocsAssistant,
  openGateHubAssistant,
  useGateHubAssistant,
} from "@/assistant";

/** @deprecated The root shell is mounted globally in main.tsx — do not render this. */
export function DocsAssistant() {
  return null;
}

/** @deprecated use useGateHubAssistant */
export function useDocsAssistant() {
  const ctx = useGateHubAssistantOptional();
  return {
    openAssistant: ctx?.open ?? openDocsAssistant,
    closeAssistant: ctx?.close ?? (() => {}),
    isOpen: ctx?.isOpen ?? false,
  };
}
