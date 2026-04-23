// ============================================================
// COS3 App SDK — Audio Manager (Host-side)
// ============================================================

import type { AudioPlayOptions, HostCallResult } from "./types";
import { generateUUID } from "./index";

interface PlaybackEntry {
  id: string;
  audio: HTMLAudioElement;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private playing = new Map<string, PlaybackEntry>();

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  play(opts: AudioPlayOptions): string {
    this.getCtx(); // ensure context is running
    const id = generateUUID();
    const audio = new Audio(opts.src);
    audio.volume = opts.volume ?? 1;
    audio.loop = opts.loop ?? false;
    if (opts.startAt) audio.currentTime = opts.startAt;
    audio.play().catch((err) => {
      console.error("[COS3 Audio]", err);
    });
    this.playing.set(id, { id, audio });
    audio.addEventListener("ended", () => this.playing.delete(id));
    return id;
  }

  stop(id: string): void {
    const entry = this.playing.get(id);
    if (!entry) return;
    entry.audio.pause();
    entry.audio.currentTime = 0;
    this.playing.delete(id);
  }

  setVolume(id: string, volume: number): void {
    const entry = this.playing.get(id);
    if (entry) entry.audio.volume = Math.max(0, Math.min(1, volume));
  }

  stopAll(): void {
    for (const id of [...this.playing.keys()]) this.stop(id);
  }
}