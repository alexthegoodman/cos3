import { Spring } from './anim';
import type { Rect } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

/** Stable widget identity derived from a string label. */
export class Id {
  readonly hash: number;

  constructor(readonly label: string) {
    // djb2
    let h = 5381;
    for (let i = 0; i < label.length; i++) {
      h = ((h << 5) + h) ^ label.charCodeAt(i);
      h = h >>> 0;
    }
    this.hash = h;
  }

  child(index: number | string): Id {
    return new Id(`${this.label}/${index}`);
  }

  toString() { return this.label; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-widget persistent state
// ─────────────────────────────────────────────────────────────────────────────

export interface WidgetState {
  /** Spring for hover highlight (0 = not hovered, 1 = hovered). */
  hoverSpring:  Spring;
  /** Spring for open/close scale (0 = closed, 1 = open). */
  openSpring:   Spring;
  /** Whether a window/panel is "open". */
  isOpen:       boolean;
  /** Whether a window is minimised to the taskbar. */
  isMinimised:  boolean;
  /** Draggable window position. */
  winRect:      Rect;
  /** Scroll offset in pixels. */
  scrollY:      number;
  /** Selected tab index. */
  tabIndex:     number;
  /** Text cursor position (byte offset). */
  cursor:       number;
  /** Dropdown open state. */
  dropdownOpen: boolean;
}

function makeWidgetState(): WidgetState {
  return {
    hoverSpring:  Spring.snappy(),
    openSpring:   Spring.snappy(),
    isOpen:       false,
    isMinimised:  false,
    winRect:      { x: 0, y: 0, w: 0, h: 0 },
    scrollY:      0,
    tabIndex:     0,
    cursor:       0,
    dropdownOpen: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FrameState — persists between frames, one instance per Ui context
// ─────────────────────────────────────────────────────────────────────────────

export class FrameState {
  private readonly widgets = new Map<string, WidgetState>();

  /** Which widget has keyboard focus. */
  focusId: string | null = null;

  /** Which window is being dragged (its id.label). */
  dragId: string | null = null;
  dragOffset = { x: 0, y: 0 };

  /** Window z-order — last element is on top. */
  windowOrder: string[] = [];

  /** Set to true if any spring is still animating; drives repaint requests. */
  needsRepaint = false;

  get(id: Id): WidgetState {
    const k = id.label;
    if (!this.widgets.has(k)) this.widgets.set(k, makeWidgetState());
    return this.widgets.get(k)!;
  }

  hasFocus(id: Id): boolean { return this.focusId === id.label; }
  setFocus(id: Id)          { this.focusId = id.label; }
  clearFocus()              { this.focusId = null; }

  bringToFront(id: Id) {
    const l = id.label;
    this.windowOrder = this.windowOrder.filter(x => x !== l);
    this.windowOrder.push(l);
  }

  beginFrame() {
    this.needsRepaint = false;
  }

  /** Advance all springs; set `needsRepaint` if any are still moving. */
  tickSprings(dt: number) {
    for (const ws of this.widgets.values()) {
      if (ws.hoverSpring.update(ws.hoverSpring.value, dt)) this.needsRepaint = true;
      if (ws.openSpring.update(ws.openSpring.value, dt))   this.needsRepaint = true;
    }
  }
}