import type { Rect } from './types';
import { Rect as R } from './types';

export type MouseButton = 0 | 1 | 2;

/**
 * Snapshot of all input for one frame.
 * The host application builds this from DOM events and passes it to `Ui.begin()`.
 */
export interface InputState {
  /** Pointer position in logical (CSS) pixels. */
  pointer:         { x: number; y: number };
  /** Buttons currently held. */
  buttonsHeld:     Set<MouseButton>;
  /** Buttons that went down this frame. */
  buttonsPressed:  Set<MouseButton>;
  /** Buttons that went up this frame. */
  buttonsReleased: Set<MouseButton>;
  /** Wheel delta in pixels this frame. */
  wheelDelta:      { x: number; y: number };
  /** Characters typed this frame (already Unicode-decoded, in order). */
  chars:           string[];
  /** Keys pressed this frame. */
  keysPressed:     Set<Key>;
  /** Keys released this frame. */
  keysReleased:    Set<Key>;
  /** Keys currently held. */
  keysHeld:        Set<Key>;
  /** High-res time in seconds (e.g. performance.now() / 1000). */
  time:            number;
  /** Seconds since last frame. */
  dt:              number;
  /** Physical pixel ratio (window.devicePixelRatio). */
  dpr:             number;
}

export const Key = {
  Backspace: 'Backspace', Delete: 'Delete', Enter: 'Enter',
  Tab: 'Tab', Escape: 'Escape',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
  Home: 'Home', End: 'End',
  KeyA: 'KeyA', KeyC: 'KeyC', KeyV: 'KeyV', KeyX: 'KeyX', KeyZ: 'KeyZ',
} as const;
export type Key = typeof Key[keyof typeof Key];

export function makeInputState(partial: Partial<InputState> = {}): InputState {
  return {
    pointer:         { x: 0, y: 0 },
    buttonsHeld:     new Set(),
    buttonsPressed:  new Set(),
    buttonsReleased: new Set(),
    wheelDelta:      { x: 0, y: 0 },
    chars:           [],
    keysPressed:     new Set(),
    keysReleased:    new Set(),
    keysHeld:        new Set(),
    time:            0,
    dt:              0,
    dpr:             1,
    ...partial,
  };
}

/** Convenience helpers used inside widget code. */
export const Input = {
  pointerIn(input: InputState, rect: Rect): boolean {
    return R.contains(rect, input.pointer.x, input.pointer.y);
  },
  leftDown(input: InputState)     { return input.buttonsHeld.has(0); },
  leftPressed(input: InputState)  { return input.buttonsPressed.has(0); },
  leftReleased(input: InputState) { return input.buttonsReleased.has(0); },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM event collector
// Attach to a canvas element; call `collect()` each frame to drain.
// ─────────────────────────────────────────────────────────────────────────────

export class InputCollector {
  private px = 0; private py = 0;
  private held     = new Set<MouseButton>();
  private pressed  = new Set<MouseButton>();
  private released = new Set<MouseButton>();
  private wheel    = { x: 0, y: 0 };
  private chars:  string[] = [];
  private kPressed  = new Set<Key>();
  private kReleased = new Set<Key>();
  private kHeld     = new Set<Key>();
  private lastTime  = performance.now() / 1000;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly canvas: HTMLElement) {
    const add = <K extends keyof HTMLElementEventMap>(
      type: K, fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      canvas.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => canvas.removeEventListener(type, fn as EventListener));
    };
    const addW = <K extends keyof WindowEventMap>(
      type: K, fn: (e: WindowEventMap[K]) => void,
    ) => {
      window.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => window.removeEventListener(type, fn as EventListener));
    };

    add('pointermove', (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.px = e.clientX - rect.left;
      this.py = e.clientY - rect.top;
    });
    add('pointerdown', (e: PointerEvent) => {
      const b = e.button as MouseButton;
      this.held.add(b); this.pressed.add(b);
    });
    add('pointerup', (e: PointerEvent) => {
      const b = e.button as MouseButton;
      this.held.delete(b); this.released.add(b);
    });
    add('wheel', (e: WheelEvent) => {
      this.wheel.x += e.deltaX; this.wheel.y += e.deltaY;
      e.preventDefault();
    });
    addW('keydown', (e: KeyboardEvent) => {
      const k = e.code as Key;
      this.kHeld.add(k); this.kPressed.add(k);
      if (e.key.length === 1) this.chars.push(e.key);
    });
    addW('keyup', (e: KeyboardEvent) => {
      const k = e.code as Key;
      this.kHeld.delete(k); this.kReleased.add(k);
    });
  }

  collect(): InputState {
    const now  = performance.now() / 1000;
    const dt   = now - this.lastTime;
    this.lastTime = now;

    const state = makeInputState({
      pointer:         { x: this.px, y: this.py },
      buttonsHeld:     new Set(this.held),
      buttonsPressed:  new Set(this.pressed),
      buttonsReleased: new Set(this.released),
      wheelDelta:      { ...this.wheel },
      chars:           [...this.chars],
      keysPressed:     new Set(this.kPressed),
      keysReleased:    new Set(this.kReleased),
      keysHeld:        new Set(this.kHeld),
      time:            now,
      dt:              Math.max(0, Math.min(dt, 0.1)),
      dpr:             window.devicePixelRatio ?? 1,
    });

    // Clear per-frame accumulators
    this.pressed.clear();
    this.released.clear();
    this.wheel.x = 0; this.wheel.y = 0;
    this.chars.length = 0;
    this.kPressed.clear();
    this.kReleased.clear();

    return state;
  }

  destroy() { this.cleanup.forEach(fn => fn()); }
}