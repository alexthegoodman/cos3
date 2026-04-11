import type { Batcher } from './gpu/batcher';
import type { FontAtlas } from './font/atlas';
import type { Color, Rect, Theme } from './types';

const GLYPH_RES = 48; // must match atlas.ts

/**
 * Painter — the draw API that widget code calls each frame.
 * All coordinates are in logical (CSS) pixels.
 */
export class Painter {
  constructor(
    private readonly b:     Batcher,
    private readonly font:  FontAtlas,
    private readonly theme: Theme,
  ) {}

  // ── Clip ──────────────────────────────────────────────────────────────────

  pushClip(r: Rect) { this.b.pushClip(r.x, r.y, r.w, r.h); }
  popClip()         { this.b.popClip(); }

  // ── Filled shapes ─────────────────────────────────────────────────────────

  fillRect(r: Rect, color: Color, radius = 0) {
    this.b.pushQuad(r.x, r.y, r.w, r.h, color, { radius });
  }

  fillRoundedRect(r: Rect, color: Color, radius?: number) {
    this.fillRect(r, color, radius ?? this.theme.radius);
  }

  // ── Bordered shapes ───────────────────────────────────────────────────────

  borderedRect(r: Rect, fill: Color, border: Color, radius?: number, bw?: number) {
    this.b.pushQuad(r.x, r.y, r.w, r.h, fill, {
      radius:      radius ?? this.theme.radius,
      borderWidth: bw     ?? this.theme.borderWidth,
      borderColor: border,
    });
  }

  // ── Opacity / fade ────────────────────────────────────────────────────────

  fillRectAlpha(r: Rect, color: Color, opacity: number, radius = 0) {
    this.b.pushQuad(r.x, r.y, r.w, r.h, color, { radius, opacity });
  }

  // ── Text ──────────────────────────────────────────────────────────────────

  /**
   * Draw a string and return the rendered pixel width.
   * `fontSize` is in logical pixels.
   */
  text(
    str: string,
    x: number, y: number,
    color: Color,
    fontSize: number,
    maxWidth?: number,
  ): number {
    if (!str) return 0;

    // Scale factor: atlas rendered at GLYPH_RES, we display at fontSize
    const scale = fontSize / GLYPH_RES;

    let cx = x;
    for (const char of str) {
      if (char === ' ') {
        cx += fontSize * 0.28;
        continue;
      }
      const g = this.font.glyph(char, GLYPH_RES);
      if (!g) { cx += fontSize * 0.5; continue; }

      const gw = g.atlasW * scale;
      const gh = g.atlasH * scale;
      const gx = cx - g.lsb * fontSize;
      const gy = y  - g.top * fontSize;

      if (maxWidth !== undefined && gx + gw - x > maxWidth) break;

      this.b.pushQuad(gx, gy, gw, gh, color, {
        mode: 1,
        uvX: g.uvX, uvY: g.uvY,
        uvW: g.uvW, uvH: g.uvH,
      });
      cx += g.advance * fontSize;
    }
    return cx - x;
  }

  /** Measure text width without drawing. */
  measureText(str: string, fontSize: number): number {
    return this.font.measureText(str, fontSize);
  }

  /** Draw text centered within a rect. */
  textCentered(str: string, r: Rect, color: Color, fontSize?: number) {
    const fs  = fontSize ?? this.theme.fontSize;
    const tw  = this.measureText(str, fs);
    const tx  = r.x + (r.w - tw) / 2;
    const ty  = r.y + (r.h - fs) / 2 + fs * 0.8; // approx baseline
    this.text(str, tx, ty, color, fs);
  }

  /** Draw text left-aligned with padding. */
  textInRect(str: string, r: Rect, color: Color, fontSize?: number) {
    const fs = fontSize ?? this.theme.fontSize;
    const ty = r.y + (r.h - fs) / 2 + fs * 0.8;
    this.text(str, r.x + this.theme.padding, ty, color, fs, r.w - this.theme.padding * 2);
  }

  // ── Window texture compositing ────────────────────────────────────────────

  /**
   * Composite a GPUTexture (rendered by an app window) into a rect with
   * rounded corners and optional opacity.
   */
  blitTexture(
    r: Rect,
    texture: GPUTexture,
    opts: { radius?: number; opacity?: number } = {},
  ) {
    this.b.blitWindow(r.x, r.y, r.w, r.h, texture, opts);
  }

  // ── Shadow ────────────────────────────────────────────────────────────────

  shadow(r: Rect, radius = this.theme.radius, blur = 8, opacity = 0.3) {
    // Approximate shadow as an expanded rect with lower opacity
    const shadow = { x: r.x + 2, y: r.y + 4, w: r.w, h: r.h };
    for (let i = blur; i > 0; i -= 2) {
      const expanded = { x: shadow.x - i/2, y: shadow.y - i/2 + i/4,
                         w: r.w + i, h: r.h + i };
      this.fillRectAlpha(expanded,
        { r: 0, g: 0, b: 0, a: 255 },
        (opacity / (blur / 2)) * (blur - i + 1),
        radius + i / 2,
      );
    }
  }

  // ── Hairline ──────────────────────────────────────────────────────────────

  hline(x: number, y: number, w: number, color: Color) {
    this.b.pushQuad(x, y, w, 1, color);
  }

  vline(x: number, y: number, h: number, color: Color) {
    this.b.pushQuad(x, y, 1, h, color);
  }

  // ── Chevron (▾) ───────────────────────────────────────────────────────────

  chevron(cx: number, cy: number, color: Color, size = 5) {
    // Two small rects rotated: approximated as two thin quads
    this.b.pushQuad(cx - size, cy - size/2, size, 1.5, color, { radius: 1 });
    this.b.pushQuad(cx,        cy - size/2, size, 1.5, color, { radius: 1 });
    // simple V hint: just draw a V via two lines
    // (a proper chevron would use a textured glyph; this is a placeholder)
  }
}