/**
 * Audio service — platform-owned sounds; renderers never play audio directly.
 */

export type AudioCue =
  | "correct"
  | "wrong"
  | "countdown"
  | "achievement"
  | "timer_tick"
  | "live_join"
  | "completion";

const CUE_PATHS: Partial<Record<AudioCue, string>> = {
  correct: "/sounds/correct.mp3",
  wrong: "/sounds/wrong.mp3",
  countdown: "/sounds/countdown.mp3",
  achievement: "/sounds/achievement.mp3",
  timer_tick: "/sounds/tick.mp3",
  live_join: "/sounds/live-join.mp3",
  completion: "/sounds/completion.mp3",
};

export class AudioService {
  private enabled = true;
  private volume = 0.5;
  private cache = new Map<AudioCue, HTMLAudioElement>();

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  play(cue: AudioCue): void {
    if (!this.enabled || typeof window === "undefined") return;

    let audio = this.cache.get(cue);
    if (!audio) {
      const src = CUE_PATHS[cue];
      if (!src) return;
      audio = new Audio(src);
      this.cache.set(cue, audio);
    }
    audio.volume = this.volume;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* autoplay policy — silent fail */
    });
  }
}

export function createAudioService(): AudioService {
  return new AudioService();
}
