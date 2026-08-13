type SaveFn = () => Promise<void> | void;

export class AutosaveCoordinator {
  private timer: number | null = null;
  private dirty = false;

  constructor(
    private readonly debounceMs: number,
    private readonly onSave: SaveFn
  ) {}

  markDirty() {
    this.dirty = true;
    this.schedule();
  }

  markClean() {
    this.dirty = false;
  }

  schedule() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (this.dirty) void this.flush();
    }, this.debounceMs);
  }

  async flush() {
    if (!this.dirty) return;
    await this.onSave();
    this.dirty = false;
  }

  dispose() {
    if (this.timer) window.clearTimeout(this.timer);
  }
}
