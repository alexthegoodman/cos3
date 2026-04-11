import Konva from 'konva';
import type { GpuContext } from './gpu/context';
import type { Theme } from './types';
import { Theme as Themes } from './types';

/**
 * Ui — the top-level context, now powered by Konva.js.
 */
export class Ui {
  readonly gpu:    GpuContext;
  readonly stage:  Konva.Stage;
  readonly layer:  Konva.Layer;
  theme:           Theme;

  private constructor(
    gpu:    GpuContext,
    canvas: HTMLCanvasElement,
    theme:  Theme,
  ) {
    this.gpu   = gpu;
    this.theme = theme;

    // Initialize Konva Stage using the provided canvas (it will be cleared/wrapped)
    this.stage = new Konva.Stage({
      container: canvas.parentElement!,
      width:     canvas.width  / devicePixelRatio,
      height:    canvas.height / devicePixelRatio,
    });

    // Create a main layer for all UI components
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // Sync Konva stage size with window
    window.addEventListener('resize', () => {
      this.stage.width(window.innerWidth);
      this.stage.height(window.innerHeight);
    });
  }

  static async init(
    canvas: HTMLCanvasElement,
    theme?: Theme,
  ): Promise<Ui> {
    const { GpuContext } = await import('./gpu/context');
    const gpu = await GpuContext.init();
    return new Ui(gpu, canvas, theme ?? Themes.dark());
  }

  /**
   * Redraw the Konva layer.
   * In a retained-mode system, this is called each frame if anything changed.
   */
  render() {
    this.layer.batchDraw();
  }

  /** Get the 2D stage width/height in logical pixels. */
  get width()  { return this.stage.width(); }
  get height() { return this.stage.height(); }

  dispose() {
    this.stage.destroy();
  }
}
