import type { InputState } from '../input';
import { Input } from '../input';
import type { Painter } from '../painter';
import type { FrameState } from '../state';
import { Id } from '../state';
import type { Color, Rect, Theme } from '../types';
import { Color as C } from '../types';
import { LayoutCursor } from '../layout';

// ─────────────────────────────────────────────────────────────────────────────
// Response
// ─────────────────────────────────────────────────────────────────────────────

export interface Response {
  hovered:  boolean;
  pressed:  boolean;
  held:     boolean;
  released: boolean;
  /** Convenience: released while hovered (= click). */
  clicked:  boolean;
  changed:  boolean;
}

const noResp = (): Response =>
  ({ hovered: false, pressed: false, held: false, released: false, clicked: false, changed: false });

// ─────────────────────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────────────────────

export function button(
  id: Id, label: string, rect: Rect,
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
): Response {
  const ws      = fs.get(id);
  const hovered = Input.pointerIn(input, rect);
  const hs      = ws.hoverSpring;
  const still   = hs.update(hovered ? 1 : 0, input.dt);
  if (still) fs.needsRepaint = true;

  const pressed = hovered && Input.leftDown(input);
  const clicked = hovered && Input.leftReleased(input);

  const bg = pressed
    ? theme.accentPress
    : C.lerp(theme.accent, theme.accentHover, hs.value);

  p.fillRoundedRect(rect, bg);
  p.textCentered(label, rect, theme.text, theme.fontSize);

  return { hovered, pressed, held: pressed,
           released: clicked, clicked, changed: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Label
// ─────────────────────────────────────────────────────────────────────────────

export function label(
  text: string, rect: Rect,
  p: Painter, theme: Theme,
  color?: Color, fontSize?: number,
): void {
  const fs   = fontSize ?? theme.fontSize;
  const col  = color   ?? theme.text;
  const ty   = rect.y + (rect.h - fs) / 2 + fs * 0.8;
  p.text(text, rect.x, ty, col, fs, rect.w);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text Input (single-line)
// ─────────────────────────────────────────────────────────────────────────────

export function textInput(
  id: Id, value: { current: string }, rect: Rect,
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
  hint?: string,
): Response {
  const focused = fs.hasFocus(id);
  const hovered = Input.pointerIn(input, rect);

  if (hovered && Input.leftPressed(input)) fs.setFocus(id);

  const borderCol = focused
    ? theme.accent
    : C.lerp(theme.border, theme.accent, hovered ? 0.4 : 0);

  p.borderedRect(rect, theme.surface, borderCol);

  let changed = false;
  const ws = fs.get(id);

  if (focused) {
    for (const ch of input.chars) {
      if (!isControl(ch)) {
        const before = value.current.slice(0, ws.cursor);
        const after  = value.current.slice(ws.cursor);
        value.current = before + ch + after;
        ws.cursor    += ch.length;
        changed       = true;
      }
    }
    for (const key of input.keysPressed) {
      switch (key) {
        case 'Backspace':
          if (ws.cursor > 0) {
            const prev = prevBoundary(value.current, ws.cursor);
            value.current = value.current.slice(0, prev) + value.current.slice(ws.cursor);
            ws.cursor = prev; changed = true;
          }
          break;
        case 'ArrowLeft':  ws.cursor = prevBoundary(value.current, ws.cursor); break;
        case 'ArrowRight': ws.cursor = nextBoundary(value.current, ws.cursor); break;
        case 'Home':       ws.cursor = 0; break;
        case 'End':        ws.cursor = value.current.length; break;
      }
    }
  }

  const inner = { x: rect.x + theme.padding / 2, y: rect.y,
                  w: rect.w - theme.padding, h: rect.h };

  if (value.current === '' && hint) {
    const hy = rect.y + (rect.h - theme.fontSize) / 2 + theme.fontSize * 0.8;
    p.text(hint, inner.x, hy, theme.textDim, theme.fontSize, inner.w);
  } else {
    const ty = rect.y + (rect.h - theme.fontSize) / 2 + theme.fontSize * 0.8;
    p.text(value.current, inner.x, ty, theme.text, theme.fontSize, inner.w);
  }

  // Cursor blink
  if (focused && Math.floor(input.time * 2) % 2 === 0) {
    const before = value.current.slice(0, ws.cursor);
    const cx     = inner.x + p.measureText(before, theme.fontSize);
    const cy1    = rect.y + (rect.h - theme.fontSize) / 2;
    p.vline(cx, cy1, theme.fontSize + 2, theme.accent);
  }

  return { hovered, pressed: false, held: false,
           released: false, clicked: false, changed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Textarea (multi-line)
// ─────────────────────────────────────────────────────────────────────────────

export function textarea(
  id: Id, value: { current: string }, rect: Rect,
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
): Response {
  const focused = fs.hasFocus(id);
  const hovered = Input.pointerIn(input, rect);
  if (hovered && Input.leftPressed(input)) fs.setFocus(id);

  const borderCol = focused ? theme.accent : theme.border;
  p.borderedRect(rect, theme.surface, borderCol);
  p.pushClip(rect);

  let changed = false;
  const ws = fs.get(id);

  if (focused) {
    for (const ch of input.chars) {
      const before = value.current.slice(0, ws.cursor);
      const after  = value.current.slice(ws.cursor);
      value.current = before + ch + after;
      ws.cursor    += ch.length;
      changed       = true;
    }
    for (const key of input.keysPressed) {
      if (key === 'Backspace' && ws.cursor > 0) {
        const prev = prevBoundary(value.current, ws.cursor);
        value.current = value.current.slice(0, prev) + value.current.slice(ws.cursor);
        ws.cursor = prev; changed = true;
      }
    }
  }

  const inner = { x: rect.x + theme.padding / 2,
                  y: rect.y + theme.padding / 2,
                  w: rect.w - theme.padding, h: rect.h - theme.padding };
  const lineH = theme.fontSize * 1.5;
  const lines = value.current.split('\n');
  let ly = inner.y + theme.fontSize * 0.8;
  for (const line of lines) {
    p.text(line, inner.x, ly, theme.text, theme.fontSize, inner.w);
    ly += lineH;
  }

  p.popClip();
  return { hovered, pressed: false, held: false,
           released: false, clicked: false, changed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

/** Draw a tab bar. Returns the active tab index. */
export function tabs(
  id: Id, labels: readonly string[], rect: Rect,
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
): number {
  const ws      = fs.get(id);
  const current = ws.tabIndex;
  const tabW    = rect.w / labels.length;

  p.fillRoundedRect(rect, theme.surface);
  p.hline(rect.x, rect.y + rect.h - 1, rect.w, theme.border);

  let next = current;
  labels.forEach((lbl, i) => {
    const tr: Rect = { x: rect.x + i * tabW, y: rect.y, w: tabW, h: rect.h };
    const active   = i === current;
    const hovered  = Input.pointerIn(input, tr);

    const bg = active ? theme.surfaceRaised
             : hovered ? C.lerp(theme.surface, theme.surfaceRaised, 0.5)
             : theme.surface;

    p.fillRoundedRect({ ...tr, h: tr.h - 1 }, bg, Math.min(theme.radius, 4));
    if (active) p.hline(tr.x + 2, tr.y + tr.h - 2, tr.w - 4, theme.accent);

    const col = active ? theme.text : theme.textDim;
    p.textCentered(lbl, tr, col, theme.fontSizeSmall);

    if (hovered && Input.leftReleased(input)) next = i;
  });

  ws.tabIndex = next;
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the newly selected index. */
export function dropdown(
  id: Id, options: readonly string[], current: number, rect: Rect,
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
): number {
  const ws      = fs.get(id);
  const hovered = Input.pointerIn(input, rect);
  const bg      = ws.dropdownOpen || hovered ? theme.surfaceRaised : theme.surface;

  p.borderedRect(rect, bg, theme.border);
  p.textInRect(options[current] ?? '', rect, theme.text, theme.fontSize);

  // Chevron indicator
  const chevX = rect.x + rect.w - theme.padding - 4;
  const chevY = rect.y + rect.h / 2;
  p.hline(chevX - 4, chevY, 4, theme.textDim);
  p.hline(chevX,     chevY, 4, theme.textDim);

  if (hovered && Input.leftReleased(input)) ws.dropdownOpen = !ws.dropdownOpen;

  let selected = current;

  if (ws.dropdownOpen) {
    const itemH    = rect.h;
    const popupH   = itemH * options.length;
    const popup: Rect = { x: rect.x, y: rect.y + rect.h, w: rect.w, h: popupH };
    p.borderedRect(popup, theme.surfaceRaised, theme.border);

    options.forEach((opt, i) => {
      const ir: Rect = { x: popup.x, y: popup.y + i * itemH, w: popup.w, h: itemH };
      const ih       = Input.pointerIn(input, ir);
      if (ih) p.fillRoundedRect({ ...ir, x: ir.x + 2, w: ir.w - 4 },
                                 C.withAlpha(theme.accent, 50), 4);
      const col = i === current ? theme.accent : theme.text;
      p.textInRect(opt, ir, col, theme.fontSize);
      if (ih && Input.leftReleased(input)) { selected = i; ws.dropdownOpen = false; }
    });

    if (Input.leftReleased(input) &&
        !Input.pointerIn(input, rect) &&
        !Input.pointerIn(input, popup)) {
      ws.dropdownOpen = false;
    }
  }

  return selected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Container
// ─────────────────────────────────────────────────────────────────────────────

/** Draw a styled container and return its layout cursor. */
export function container(
  rect: Rect,
  p: Painter, theme: Theme,
  opts: { raised?: boolean; border?: boolean } = {},
): LayoutCursor {
  const bg = opts.raised ? theme.surfaceRaised : theme.surface;
  if (opts.border) {
    p.borderedRect(rect, bg, theme.border);
  } else {
    p.fillRoundedRect(rect, bg);
  }
  return new LayoutCursor(rect, theme.padding, theme.gap);
}

// ─────────────────────────────────────────────────────────────────────────────
// Number input (thin wrapper around textInput)
// ─────────────────────────────────────────────────────────────────────────────

export function numberInput(
  id: Id, value: { current: number }, rect: Rect,
  p: Painter, fs: FrameState, input: InputState, theme: Theme,
  opts: { min?: number; max?: number; step?: number } = {},
): Response {
  const str = { current: String(value.current) };
  const resp = textInput(id, str, rect, p, fs, input, theme);
  if (resp.changed) {
    const n = parseFloat(str.current);
    if (!isNaN(n)) {
      let clamped = n;
      if (opts.min !== undefined) clamped = Math.max(opts.min, clamped);
      if (opts.max !== undefined) clamped = Math.min(opts.max, clamped);
      value.current = clamped;
    }
  }
  return resp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function isControl(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code < 32 && ch !== '\n' && ch !== '\t';
}

function prevBoundary(s: string, pos: number): number {
  if (pos === 0) return 0;
  let i = pos - 1;
  while (i > 0 && (s.charCodeAt(i) & 0xC0) === 0x80) i--;
  return i;
}

function nextBoundary(s: string, pos: number): number {
  if (pos >= s.length) return s.length;
  let i = pos + 1;
  while (i < s.length && (s.charCodeAt(i) & 0xC0) === 0x80) i++;
  return i;
}