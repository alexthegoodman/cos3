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
 * Grid cursor for N-column layouts.
 */
export class GridCursor {
  private _y: number;
  private _col: number = 0;
  private _rowHeight: number = 0;
  readonly innerX: number;
  readonly innerW: number;
  readonly colW: number;

  constructor(
    readonly bounds:   Rect,
    readonly cols:     number,
    readonly padding:  number,
    readonly gap:      number,
  ) {
    this._y     = bounds.y + padding;
    this.innerX = bounds.x + padding;
    this.innerW = Math.max(0, bounds.w - padding * 2);
    this.colW   = (this.innerW - (cols - 1) * gap) / cols;
  }

  next(height: number): Rect {
    const r: Rect = { 
      x: this.innerX + this._col * (this.colW + this.gap), 
      y: this._y, 
      w: this.colW, 
      h: height 
    };
    
    this._rowHeight = Math.max(this._rowHeight, height);
    this._col++;
    
    if (this._col >= this.cols) {
      this._col = 0;
      this._y += this._rowHeight + this.gap;
      this._rowHeight = 0;
    }
    
    return r;
  }

  get usedHeight(): number {
    return Math.max(0, this._y + (this._col > 0 ? this._rowHeight : -this.gap) - this.bounds.y - this.padding);
  }
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