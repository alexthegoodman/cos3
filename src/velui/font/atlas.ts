/**
 * FontAtlas — rasterises glyphs on-demand using an OffscreenCanvas and uploads
 * them to the GpuAtlas.
 *
 * We use a simple 1-channel SDF approach via an OffscreenCanvas:
 *  1. Draw each glyph oversized onto a canvas at GLYPH_SIZE.
 *  2. Upload the alpha channel as a signed-distance approximation.
 *
 * For a production system you'd use an msdf-bmfont-generated atlas;
 * this gives good results for UI text at 10–24px without a pre-build step.
 */
import type { GpuAtlas } from '../gpu/batcher';

export interface GlyphInfo {
  /** UV top-left in atlas (0..1). */
  uvX: number; uvY: number;
  /** UV size in atlas (0..1). */
  uvW: number; uvH: number;
  /** Advance width in em units. */
  advance: number;
  /** Left-side bearing in em units. */
  lsb: number;
  /** Top relative to baseline in em units. */
  top: number;
  /** Glyph pixel size in atlas. */
  atlasW: number; atlasH: number;
}

/** Glyph resolution rendered into the atlas. */
const GLYPH_RES  = 48;
/** Padding around each glyph in atlas pixels. */
const GLYPH_PAD  = 6;
/** Atlas columns. */
const ATLAS_COLS = 21;

export class FontAtlas {
  private readonly glyphs = new Map<string, GlyphInfo>();
  private atlasX = 0;
  private atlasY = 0;
  private rowH   = 0;
  private readonly offscreen: OffscreenCanvas;
  private readonly ctx2d: OffscreenCanvasRenderingContext2D;

  constructor(
    private readonly atlas:    GpuAtlas,
    private readonly fontFace: string = 'system-ui, sans-serif',
  ) {
    this.offscreen = new OffscreenCanvas(GLYPH_RES + GLYPH_PAD * 2, GLYPH_RES + GLYPH_PAD * 2);
    this.ctx2d = this.offscreen.getContext('2d')!;
    this.ctx2d.textBaseline = 'alphabetic';
  }

  /**
   * Return cached or newly rasterised glyph info for a character at given em size.
   */
  glyph(char: string, emSize: number): GlyphInfo | null {
    const key = `${char}@${emSize}`;
    if (this.glyphs.has(key)) return this.glyphs.get(key)!;
    return this.rasterise(char, emSize, key);
  }

  private rasterise(char: string, emSize: number, key: string): GlyphInfo | null {
    const size = GLYPH_RES;
    const pad  = GLYPH_PAD;
    const canvasSize = size + pad * 2;

    const ctx = this.ctx2d;
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    ctx.font         = `${size}px ${this.fontFace}`;
    ctx.fillStyle    = 'white';
    ctx.textBaseline = 'top';

    const metrics = ctx.measureText(char);
    const advance = metrics.width / size;
    const lsb     = (metrics.actualBoundingBoxLeft ?? 0) / size;
    const top     = (metrics.actualBoundingBoxAscent ?? 0) / size;

    ctx.fillText(char, pad, pad);

    // Generate simple 1-channel SDF via blur + threshold trick:
    // Draw white glyph, use the alpha channel as a rough SDF.
    // For a production app: pre-generate msdf atlas files.
    const imgData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    const data    = imgData.data;

    // Convert to 4-channel RGBA where all channels = alpha (MSDF-like single ch)
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      // Pack the same value into R,G,B so the median in the shader works correctly
      // with a 1ch SDF
      data[i    ] = a;
      data[i + 1] = a;
      data[i + 2] = a;
      // data[i+3] stays as alpha
    }
    ctx.putImageData(imgData, 0, 0);

    // Check atlas space
    const atlasSize = this.atlas.px;
    if (this.atlasX + canvasSize > atlasSize) {
      this.atlasX  = 0;
      this.atlasY += this.rowH + 1;
      this.rowH    = 0;
    }
    if (this.atlasY + canvasSize > atlasSize) {
      console.warn('velui: font atlas full; consider larger atlas or fewer glyphs');
      return null;
    }

    const ax = this.atlasX;
    const ay = this.atlasY;

    // Upload via createImageBitmap → copyExternalImageToTexture
    const raw = new Uint8Array(data.buffer);
    this.atlas.uploadRaw(raw, canvasSize, canvasSize, ax, ay);

    this.atlasX += canvasSize + 1;
    this.rowH    = Math.max(this.rowH, canvasSize);

    const info: GlyphInfo = {
      uvX:    ax / atlasSize,
      uvY:    ay / atlasSize,
      uvW:    canvasSize / atlasSize,
      uvH:    canvasSize / atlasSize,
      advance,
      lsb,
      top,
      atlasW: canvasSize,
      atlasH: canvasSize,
    };
    this.glyphs.set(key, info);
    return info;
  }

  /**
   * Measure the pixel width of a string at a given em size.
   */
  measureText(text: string, fontSize: number): number {
    const ctx = this.ctx2d;
    ctx.font = `${GLYPH_RES}px ${this.fontFace}`;
    const m = ctx.measureText(text);
    return (m.width / GLYPH_RES) * fontSize;
  }

  /** Change the font face (triggers re-rasterisation of all future glyphs). */
  setFont(face: string) {
    (this as any).fontFace = face;
    this.glyphs.clear();
    this.atlasX = 0; this.atlasY = 0; this.rowH = 0;
  }
}