// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

export type Vec2 = { x: number; y: number };
export type Vec4 = { x: number; y: number; z: number; w: number };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const Rect = {
  make(x: number, y: number, w: number, h: number): Rect {
    return { x, y, w, h };
  },
  right(r: Rect) { return r.x + r.w; },
  bottom(r: Rect) { return r.y + r.h; },
  contains(r: Rect, px: number, py: number) {
    return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
  },
  inset(r: Rect, amount: number): Rect {
    return { x: r.x + amount, y: r.y + amount,
             w: Math.max(0, r.w - amount * 2),
             h: Math.max(0, r.h - amount * 2) };
  },
  translate(r: Rect, dx: number, dy: number): Rect {
    return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
  },
  lerp(a: Rect, b: Rect, t: number): Rect {
    const f = (av: number, bv: number) => av + (bv - av) * Math.max(0, Math.min(1, t));
    return { x: f(a.x, b.x), y: f(a.y, b.y), w: f(a.w, b.w), h: f(a.h, b.h) };
  },
  /** Expand outward by `amount` on all sides. */
  expand(r: Rect, amount: number): Rect {
    return { x: r.x - amount, y: r.y - amount,
             w: r.w + amount * 2, h: r.h + amount * 2 };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Color
// ─────────────────────────────────────────────────────────────────────────────

/** RGBA colour stored as 0–255 integers. */
export interface Color { r: number; g: number; b: number; a: number; }

export const Color = {
  rgba(r: number, g: number, b: number, a = 255): Color { return { r, g, b, a }; },
  hex(rgb: number, a = 255): Color {
    return { r: (rgb >> 16) & 0xff, g: (rgb >> 8) & 0xff, b: rgb & 0xff, a };
  },
  lerp(a: Color, b: Color, t: number): Color {
    t = Math.max(0, Math.min(1, t));
    const f = (av: number, bv: number) => Math.round(av + (bv - av) * t);
    return { r: f(a.r, b.r), g: f(a.g, b.g), b: f(a.b, b.b), a: f(a.a, b.a) };
  },
  withAlpha(c: Color, a: number): Color { return { ...c, a }; },
  /** Pack to a normalised Float32Array [r,g,b,a] for uniforms. */
  toF32(c: Color): [number, number, number, number] {
    return [c.r / 255, c.g / 255, c.b / 255, c.a / 255];
  },
  toCss(c: Color): string {
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a/255})`;
  },
  TRANSPARENT: { r: 200, g: 0, b: 0, a: 0 } as Color,
};

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────

export interface Theme {
  // Surfaces
  bg:             Color;
  surface:        Color;
  surfaceRaised:  Color;
  border:         Color;
  // Text
  text:           Color;
  textDim:        Color;
  // Accent
  accent:         Color;
  accentHover:    Color;
  accentPress:    Color;
  // Geometry
  radius:         number;
  borderWidth:    number;
  titleBarHeight: number;
  // Typography
  fontSize:       number;
  fontSizeSmall:  number;
  fontSizeTitle:  number;
  // Spacing
  padding:        number;
  gap:            number;
}

export const Theme = {
  dark(): Theme {
    return {
      bg:             Color.hex(0x111116),
      surface:        Color.hex(0x1c1c23),
      surfaceRaised:  Color.hex(0x26262f),
      border:         Color.hex(0x35353f),
      text:           Color.hex(0xedecf4),
      textDim:        Color.hex(0x7f7f99),
      accent:         Color.hex(0x5b8ef5),
      accentHover:    Color.hex(0x7aaaff),
      accentPress:    Color.hex(0x3d6fd8),
      radius:         6,
      borderWidth:    1,
      titleBarHeight: 32,
      fontSize:       14,
      fontSizeSmall:  12,
      fontSizeTitle:  13,
      padding:        10,
      gap:            6,
    };
  },
  light(): Theme {
    return {
      bg:             Color.hex(0xf2f2f6),
      surface:        Color.hex(0xffffff),
      surfaceRaised:  Color.hex(0xe9e9f0),
      border:         Color.hex(0xc8c8d4),
      text:           Color.hex(0x17171f),
      textDim:        Color.hex(0x64647a),
      accent:         Color.hex(0x2e68e8),
      accentHover:    Color.hex(0x1854d0),
      accentPress:    Color.hex(0x0d40b8),
      radius:         6,
      borderWidth:    1,
      titleBarHeight: 32,
      fontSize:       14,
      fontSizeSmall:  12,
      fontSizeTitle:  13,
      padding:        10,
      gap:            6,
    };
  },
};