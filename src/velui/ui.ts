import type { GpuContext } from './gpu/context';
import { Batcher, GpuAtlas } from './gpu/batcher';
import { FontAtlas } from './font/atlas';
import { Painter } from './painter';
import { FrameState, Id } from './state';
import type { InputState } from './input';
import { InputCollector } from './input';
import type { Theme } from './types';
import { Theme as Themes } from './types';

/**
 * Ui — the top-level context.  One instance per application.
 *
 * ```ts
 * const ui = await Ui.init(canvas);
 *
 * function frame() {
 *   const input = ui.collector.collect();
 *   ui.beginFrame(input);
 *
 *   const win = ui.window(new Id('demo'), { title: 'Hello', defaultRect: ... }, input);
 *   if (win.visible) {
 *     ui.button(new Id('btn'), 'Click me', win.cursor.next(32), input);
 *     ui.windowEnd(win);
 *   }
 *
 *   ui.endFrame();
 *   requestAnimationFrame(frame);
 * }
 * requestAnimationFrame(frame);
 * ```
 */
export class Ui {
  readonly gpu:       GpuContext;
  readonly state:     FrameState;
  readonly collector: InputCollector;
  theme:              Theme;

  private readonly atlas:   GpuAtlas;
  private readonly fonts:   FontAtlas;
  private readonly batcher: Batcher;
  private canvasCtx!:       GPUCanvasContext;
  private vpW = 0;
  private vpH = 0;
  private painter!: Painter;

  private constructor(
    gpu:     GpuContext,
    canvas:  HTMLCanvasElement,
    theme:   Theme,
  ) {
    this.gpu       = gpu;
    this.state     = new FrameState();
    this.collector = new InputCollector(canvas);
    this.theme     = theme;
    this.atlas     = new GpuAtlas(gpu);
    this.fonts     = new FontAtlas(this.atlas);
    this.batcher   = new Batcher(gpu, this.atlas);
    this.canvasCtx = gpu.configureCanvas(canvas);
    this.vpW       = canvas.width;
    this.vpH       = canvas.height;
    this.painter   = new Painter(this.batcher, this.fonts, this.theme);
  }

  static async init(
    canvas: HTMLCanvasElement,
    theme?: Theme,
  ): Promise<Ui> {
    const { GpuContext } = await import('./gpu/context');
    const gpu = await GpuContext.init();
    return new Ui(gpu, canvas, theme ?? Themes.dark());
  }

  // ── Frame lifecycle ───────────────────────────────────────────────────────

  /** Call at the start of each frame, before any widget calls. */
  beginFrame(input: InputState, vpW?: number, vpH?: number): Painter {
    if (vpW !== undefined) this.vpW = vpW;
    if (vpH !== undefined) this.vpH = vpH;
    this.state.beginFrame();
    this.batcher.reset();
    // Update the painter so it has the current theme
    this.painter = new Painter(this.batcher, this.fonts, this.theme);
    return this.painter;
  }

  /**
   * Encode all draw calls and submit to the GPU.
   * Call at the end of each frame.
   */
  endFrame(): boolean {
    const encoder = this.gpu.device.createCommandEncoder({ label: 'velui-frame' });
    const target  = this.canvasCtx.getCurrentTexture().createView();

    this.batcher.flush(encoder, target, this.vpW, this.vpH, 'clear');
    this.gpu.device.queue.submit([encoder.finish()]);

    return this.state.needsRepaint;
  }

  /** Convenience: get the current painter without needing beginFrame return. */
  get p(): Painter { return this.painter; }

  // ── Widget passthrough helpers (optional ergonomic layer) ─────────────────
  // These let you call ui.button(...) instead of importing widget functions.

  get Id() { return Id; }

  dispose() {
    this.collector.destroy();
    this.batcher.dispose();
  }
}