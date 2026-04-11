import type { Rect } from './types';

/**
 * Simple top-down layout cursor.
 * Allocate rows by calling `next(height)`.
 */
export class LayoutCursor {
  private _y: number;
  readonly innerX: number;
  readonly innerW: number;

  constructor(
    readonly bounds:   Rect,
    readonly padding:  number,
    readonly gap:      number,
  ) {
    this._y     = bounds.y + padding;
    this.innerX = bounds.x + padding;
    this.innerW = Math.max(0, bounds.w - padding * 2);
  }

  /** Allocate a full-width row of `height` pixels. */
  next(height: number): Rect {
    const r: Rect = { x: this.innerX, y: this._y, w: this.innerW, h: height };
    this._y += height + this.gap;
    return r;
  }

  /** Allocate a row with an explicit width (left-aligned). */
  nextFixed(width: number, height: number): Rect {
    const r: Rect = { x: this.innerX, y: this._y, w: width, h: height };
    this._y += height + this.gap;
    return r;
  }

  /** How many pixels have been consumed (excluding trailing gap). */
  get usedHeight(): number {
    return Math.max(0, this._y - this.bounds.y - this.padding - this.gap);
  }

  /** Current Y position (top of the next row). */
  get y(): number { return this._y; }
  set y(v: number) { this._y = v; }
}

/**
 * Horizontal cursor for side-by-side items in a single row.
 */
export class HCursor {
  private _x: number;
  constructor(
    startX:         number,
    readonly y:      number,
    readonly height: number,
    readonly gap:    number,
  ) {
    this._x = startX;
  }

  next(width: number): Rect {
    const r: Rect = { x: this._x, y: this.y, w: width, h: this.height };
    this._x += width + this.gap;
    return r;
  }

  get x(): number { return this._x; }
}