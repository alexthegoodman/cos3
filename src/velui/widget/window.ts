import type { InputState } from '../input';
import { Input } from '../input';
import type { Painter } from '../painter';
import type { FrameState } from '../state';
import { Id } from '../state';
import type { Color, Rect, Theme } from '../types';
import { Color as C, Rect as R } from '../types';
import { LayoutCursor } from '../layout';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface WindowConfig {
  title:         string;
  /** Initial rect when no saved position exists. */
  defaultRect:   Rect;
  draggable?:    boolean;
  closable?:     boolean;
  minimisable?:  boolean;
  resizable?:    boolean;
  /** If provided, the window content area will blit this GPU texture. */
  contentTexture?: GPUTexture;
}

export interface WindowResult {
  /** The content area rect (below title bar). */
  contentRect: Rect;
  /** Layout cursor for placing widgets in the content area. */
  cursor:      LayoutCursor;
  /** Whether the window is currently visible (open_t > 0). */
  visible:     boolean;
  /** Whether the close button was clicked. */
  closeClicked: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Window
// ─────────────────────────────────────────────────────────────────────────────

const CLOSE_SIZE   = 12;
const MIN_SIZE     = 12;
const BTN_PADDING  =  8;

export function windowBegin(
  id: Id, cfg: WindowConfig,
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
): WindowResult {
  const ws = fs.get(id);

  // ── Initialise on first use ───────────────────────────────────────────────
  if (ws.winRect.w === 0) {
    ws.winRect = { ...cfg.defaultRect };
    ws.isOpen  = true;
    ws.openSpring.snap(1);
  }

  // ── Drag ─────────────────────────────────────────────────────────────────
  const titleBar: Rect = {
    x: ws.winRect.x, y: ws.winRect.y,
    w: ws.winRect.w, h: theme.titleBarHeight,
  };

  if (Input.leftPressed(input) && Input.pointerIn(input, titleBar) &&
      (cfg.draggable ?? true)) {
    fs.bringToFront(id);
    fs.dragId = id.label;
    fs.dragOffset = {
      x: input.pointer.x - ws.winRect.x,
      y: input.pointer.y - ws.winRect.y,
    };
  }
  if (fs.dragId === id.label) {
    if (Input.leftDown(input)) {
      ws.winRect.x = input.pointer.x - fs.dragOffset.x;
      ws.winRect.y = input.pointer.y - fs.dragOffset.y;
      fs.needsRepaint = true;
    } else {
      fs.dragId = null;
    }
  }

  // ── Open/close spring ────────────────────────────────────────────────────
  const target = ws.isOpen ? 1 : 0;
  const still  = ws.openSpring.update(target, input.dt);
  if (still) fs.needsRepaint = true;

  const openT   = ws.openSpring.value;
  const visible = openT > 0.01;

  // Animated height: scale down toward the title bar when closing
  const displayRect: Rect = {
    x: ws.winRect.x,
    y: ws.winRect.y,
    w: ws.winRect.w,
    h: theme.titleBarHeight + (ws.winRect.h - theme.titleBarHeight) * openT,
  };

  // ── Draw shadow ───────────────────────────────────────────────────────────
  if (visible) {
    p.shadow(displayRect, theme.radius, 10, 0.25 * openT);
  }

  // ── Window chrome ─────────────────────────────────────────────────────────
  const titleRect: Rect = {
    x: displayRect.x, y: displayRect.y,
    w: displayRect.w, h: theme.titleBarHeight,
  };

  if (visible) {
    // Background
    p.borderedRect(displayRect, theme.surface, theme.border);

    // Title bar fill
    p.fillRoundedRect({ ...titleRect, h: titleRect.h + theme.radius },
                       theme.surfaceRaised, theme.radius);
    p.fillRect({ x: titleRect.x + 1, y: titleRect.y + titleRect.h - theme.radius,
                 w: titleRect.w - 2, h: theme.radius },
               theme.surfaceRaised);

    // Separator
    p.hline(titleRect.x + 1,
            titleRect.y + titleRect.h - 1,
            titleRect.w - 2,
            theme.border);
  }

  // ── Title text ────────────────────────────────────────────────────────────
  let closeClicked = false;
  if (visible) {
    const textRect: Rect = {
      x: titleRect.x + theme.padding,
      y: titleRect.y,
      w: titleRect.w - theme.padding * 4 - CLOSE_SIZE * 2,
      h: titleRect.h,
    };
    const ty = titleRect.y + (titleRect.h - theme.fontSizeTitle) / 2 + theme.fontSizeTitle * 0.8;
    p.text(cfg.title, textRect.x, ty, theme.text, theme.fontSizeTitle, textRect.w);

    // ── Traffic-light buttons ─────────────────────────────────────────────
    let btnX = R.right(titleRect) - BTN_PADDING - CLOSE_SIZE;
    const btnY = titleRect.y + (titleRect.h - CLOSE_SIZE) / 2;

    if (cfg.closable ?? true) {
      const closeBtnRect: Rect = { x: btnX, y: btnY, w: CLOSE_SIZE, h: CLOSE_SIZE };
      const hov = Input.pointerIn(input, closeBtnRect);
      p.fillRoundedRect(closeBtnRect,
        hov ? C.hex(0xff5f57) : C.withAlpha(theme.border, 180),
        CLOSE_SIZE / 2);
      if (hov && Input.leftReleased(input)) {
        ws.isOpen   = false;
        closeClicked = true;
      }
      btnX -= CLOSE_SIZE + 6;
    }

    if (cfg.minimisable ?? true) {
      const minBtnRect: Rect = { x: btnX, y: btnY, w: CLOSE_SIZE, h: CLOSE_SIZE };
      const hov = Input.pointerIn(input, minBtnRect);
      p.fillRoundedRect(minBtnRect,
        hov ? C.hex(0xfebc2e) : C.withAlpha(theme.border, 180),
        CLOSE_SIZE / 2);
      if (hov && Input.leftReleased(input)) {
        ws.isMinimised = true;
        ws.isOpen      = false;
      }
    }
  }

  // ── Content area ─────────────────────────────────────────────────────────
  const contentRect: Rect = {
    x: displayRect.x + 1,
    y: displayRect.y + theme.titleBarHeight,
    w: displayRect.w - 2,
    h: Math.max(0, displayRect.h - theme.titleBarHeight - 1),
  };

  // If a texture is provided, blit it into the content area
  if (visible && cfg.contentTexture && contentRect.h > 4) {
    p.blitTexture(contentRect, cfg.contentTexture, {
      radius:  0,
      opacity: openT,
    });
  }

  return {
    contentRect,
    cursor:     new LayoutCursor(contentRect, theme.padding, theme.gap),
    visible,
    closeClicked,
  };
}

/** No-op end marker — reserved for future post-processing hooks. */
export function windowEnd(_result: WindowResult): void {}

// ─────────────────────────────────────────────────────────────────────────────
// Minimised window bar
// ─────────────────────────────────────────────────────────────────────────────

export function miniBar(
  entries: Array<{ id: Id; title: string }>,
  origin:  { x: number; y: number },
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
): void {
  const pillH   = 26;
  const pillPad = 12;
  let x = origin.x;
  const y = origin.y;

  for (const { id, title } of entries) {
    const ws = fs.get(id);
    if (!ws.isMinimised) continue;

    const tw   = p.measureText(title, theme.fontSizeSmall);
    const pillW = tw + pillPad * 2;
    const pill: Rect = { x, y, w: pillW, h: pillH };
    const hov  = Input.pointerIn(input, pill);

    p.borderedRect(pill, hov ? theme.surfaceRaised : theme.surface, theme.border,
                   pillH / 2, theme.borderWidth);

    const ty = y + (pillH - theme.fontSizeSmall) / 2 + theme.fontSizeSmall * 0.8;
    p.text(title, x + pillPad, ty, theme.text, theme.fontSizeSmall);

    if (hov && Input.leftReleased(input)) {
      ws.isMinimised = false;
      ws.isOpen      = true;
      ws.openSpring.snap(0);   // start animation from 0
    }

    x += pillW + theme.gap;
  }
}