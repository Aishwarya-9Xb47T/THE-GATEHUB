import type { OverlayComponent } from "../types/overlay";

export function createStubOverlay(label: string): OverlayComponent {
  return function StubOverlay({ isOpen, onClose }) {
    if (!isOpen) return null;
    return (
      <div className="text-sm text-muted-foreground">
        <p>{label} — coming in Phase 2</p>
        <button type="button" className="underline text-xs mt-2" onClick={onClose}>
          Close
        </button>
      </div>
    );
  };
}
