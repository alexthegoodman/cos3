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
    ws.miniSpring.snap(0);
  }

  // ── Drag ─────────────────────────────────────────────────────────────────
  const titleBar: Rect = {
    x: ws.winRect.x, y: ws.winRect.y,
    w: ws.winRect.w, h: theme.titleBarHeight,
  };

  const isMini = ws.isMinimised;
  const miniT  = ws.miniSpring.value;

  if (!isMini && miniT < 0.1) {
    if (Input.leftPressed(input) && Input.pointerIn(input, titleBar) &&
        (cfg.draggable ?? true)) {
      fs.bringToFront(id);
      fs.dragId = id.label;
      fs.dragOffset = {
        x: input.pointer.x - ws.winRect.x,
        y: input.pointer.y - ws.winRect.y,
      };
    }
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

  // ── Springs ──────────────────────────────────────────────────────────────
  const openTarget = ws.isOpen ? 1 : 0;
  if (ws.openSpring.update(openTarget, input.dt)) fs.needsRepaint = true;

  const miniTarget = ws.isMinimised ? 1 : 0;
  if (ws.miniSpring.update(miniTarget, input.dt)) fs.needsRepaint = true;

  const openT   = ws.openSpring.value;
  const visible = openT > 0.01;

  // ── Interpolate Rects ──────────────────────────────────────────────────
  // If we don't have a miniRect yet, use a default at the bottom
  const targetMini = ws.miniRect.w > 0 ? ws.miniRect : {
    x: ws.winRect.x, y: 1000, w: 240, h: 80
  };

  const displayRect = R.lerp(ws.winRect, targetMini, miniT);

  // Animated height further affected by openT (closing animation)
  const fullH = displayRect.h;
  displayRect.h = theme.titleBarHeight + (fullH - theme.titleBarHeight) * openT;

  // ── Click to re-maximise ───────────────────────────────────────────────
  if (isMini && miniT > 0.9) {
    if (Input.leftReleased(input) && Input.pointerIn(input, displayRect)) {
      ws.isMinimised = false;
      fs.bringToFront(id);
    }
  }

  // ── Draw shadow ───────────────────────────────────────────────────────────
  if (visible) {
    p.shadow(displayRect, theme.radius, 10, 0.25 * openT * (1.0 - miniT * 0.5));
  }

  // ── Window chrome ─────────────────────────────────────────────────────────
  const titleRect: Rect = {
    x: displayRect.x, y: displayRect.y,
    w: displayRect.w, h: theme.titleBarHeight,
  };

  if (visible) {
    // Background
    p.borderedRect(displayRect, theme.surface, theme.border);

    // Decorations fade out as we minimise
    const decoAlpha = 1.0 - Math.max(0, (miniT - 0.5) * 2);

    if (decoAlpha > 0.01) {
      // Title bar fill
      p.fillRectAlpha({ ...titleRect, h: titleRect.h + theme.radius },
                       theme.surfaceRaised, decoAlpha, theme.radius);
      p.fillRectAlpha({ x: titleRect.x + 1, y: titleRect.y + titleRect.h - theme.radius,
                         w: titleRect.w - 2, h: theme.radius },
                       theme.surfaceRaised, decoAlpha);

      // Separator
      p.hline(titleRect.x + 1,
              titleRect.y + titleRect.h - 1,
              titleRect.w - 2,
              C.withAlpha(theme.border, Math.round(255 * decoAlpha)));
    }
  }

  // ── Title text & buttons ──────────────────────────────────────────────────
  let closeClicked = false;
  if (visible) {
    const decoAlpha = 1.0 - Math.max(0, (miniT - 0.2) * 1.25);

    if (decoAlpha > 0.01) {
      const textRect: Rect = {
        x: titleRect.x + theme.padding,
        y: titleRect.y,
        w: titleRect.w - theme.padding * 4 - CLOSE_SIZE * 2,
        h: titleRect.h,
      };
      const ty = titleRect.y + (titleRect.h - theme.fontSizeTitle) / 2 + theme.fontSizeTitle * 0.8;
      p.text(cfg.title, textRect.x, ty, C.withAlpha(theme.text, Math.round(255 * decoAlpha)),
             theme.fontSizeTitle, textRect.w);

      // ── Traffic-light buttons ─────────────────────────────────────────────
      let btnX = R.right(titleRect) - BTN_PADDING - CLOSE_SIZE;
      const btnY = titleRect.y + (titleRect.h - CLOSE_SIZE) / 2;

      if (cfg.closable ?? true) {
        const closeBtnRect: Rect = { x: btnX, y: btnY, w: CLOSE_SIZE, h: CLOSE_SIZE };
        const hov = Input.pointerIn(input, closeBtnRect);
        p.fillRoundedRect(closeBtnRect,
          hov ? C.hex(0xff5f57) : C.withAlpha(theme.border, Math.round(180 * decoAlpha)),
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
          hov ? C.hex(0xfebc2e) : C.withAlpha(theme.border, Math.round(180 * decoAlpha)),
          CLOSE_SIZE / 2);
        if (hov && Input.leftReleased(input)) {
          ws.isMinimised = true;
        }
      }
    }
    // Mini bar title (when minimized)
    else if (miniT > 0.8) {
      const miniDecoAlpha = (miniT - 0.8) * 5;
      p.textCentered(cfg.title, displayRect, C.withAlpha(theme.text, Math.round(255 * miniDecoAlpha)),
                     theme.fontSizeSmall);
    }
  }

  // ── Content area ─────────────────────────────────────────────────────────
  const contentRect: Rect = {
    x: displayRect.x + 1,
    y: displayRect.y + theme.titleBarHeight * (1.0 - miniT),
    w: displayRect.w - 2,
    h: Math.max(0, displayRect.h - theme.titleBarHeight * (1.0 - miniT) - 1),
  };

  if (visible) {
    p.pushClip(displayRect);
  }

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
export function windowEnd(result: WindowResult, p: Painter): void {
  if (result.visible) {
    p.popClip();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimised window bar
// ─────────────────────────────────────────────────────────────────────────────

export function miniBar(
  entries: Array<{ id: Id; title: string }>,
  origin:  { x: number; y: number },
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
): void {
  const miniW   = 220;
  const miniH   = 64;
  let x = origin.x;
  const y = origin.y;

  for (const { id } of entries) {
    const ws = fs.get(id);
    if (!ws.isMinimised && ws.miniSpring.value < 0.01) continue;

    // We don't render anything here anymore; windowBegin does it.
    // We just update the target miniRect.
    ws.miniRect = { x, y: y - miniH, w: miniW, h: miniH };

    x += miniW + theme.gap;
  }
}