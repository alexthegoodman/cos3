import Konva from 'konva';
import type { Rect, Theme } from '../types';
import { Color } from '../types';

export interface WindowConfig {
  title:         string;
  x:             number;
  y:             number;
  width:         number;
  height:        number;
  draggable?:    boolean;
  closable?:     boolean;
  minimisable?:  boolean;
  /** If provided, this canvas will be displayed in the content area. */
  bridgeCanvas?: OffscreenCanvas | HTMLCanvasElement;
}

/**
 * VelWindow — a persistent Konva.Group representing a UI window.
 */
export class VelWindow extends Konva.Group {
  readonly background:  Konva.Rect;
  readonly titleBar:    Konva.Group;
  readonly titleText:   Konva.Text;
  readonly contentArea: Konva.Group;
  readonly closeBtn:    Konva.Circle;

  constructor(cfg: WindowConfig, theme: Theme) {
    super({
      x:         cfg.x,
      y:         cfg.y,
      draggable: cfg.draggable ?? true,
    });

    // 1. Shadow / Background
    this.background = new Konva.Rect({
      width:        cfg.width,
      height:       cfg.height,
      fill:         Color.toCss(theme.surface),
      cornerRadius: theme.radius,
      stroke:       Color.toCss(theme.border),
      strokeWidth:  theme.borderWidth,
      shadowColor:  'black',
      shadowBlur:   10,
      shadowOpacity: 0.3,
      shadowOffset: { x: 0, y: 4 },
    });
    this.add(this.background);

    // 2. Title Bar
    this.titleBar = new Konva.Group({
      width:  cfg.width,
      height: theme.titleBarHeight,
    });
    this.add(this.titleBar);

    // Title Background (rounded top)
    const titleBg = new Konva.Rect({
      name:         'title-bg',
      width:        cfg.width,
      height:       theme.titleBarHeight,
      fill:         Color.toCss(theme.surfaceRaised),
      cornerRadius: [theme.radius, theme.radius, 0, 0],
    });
    this.titleBar.add(titleBg);

    // Title Text
    this.titleText = new Konva.Text({
      text:       cfg.title,
      fontSize:   theme.fontSizeTitle,
      fontFamily: 'sans-serif',
      fill:       Color.toCss(theme.text),
      x:          theme.padding,
      y:          (theme.titleBarHeight - theme.fontSizeTitle) / 2,
      listening:  false, // don't block clicks to title-bg
    });
    this.titleBar.add(this.titleText);

    // 3. Traffic Light Buttons (Close)
    this.closeBtn = new Konva.Circle({
      x:      cfg.width - 20,
      y:      theme.titleBarHeight / 2,
      radius: 6,
      fill:   '#ff5f57',
    });
    this.closeBtn.on('click tap', () => this.destroy());
    this.titleBar.add(this.closeBtn);

    // 4. Content Area (Clipped)
    this.contentArea = new Konva.Group({
      x:      1,
      y:      theme.titleBarHeight,
      width:  cfg.width - 2,
      height: cfg.height - theme.titleBarHeight - 1,
      clipFunc: (ctx) => {
        ctx.rect(0, 0, cfg.width - 2, cfg.height - theme.titleBarHeight - 1);
      },
    });
    this.add(this.contentArea);

    // 5. Optional WebGPU Bridge Canvas
    if (cfg.bridgeCanvas) {
      const img = new Konva.Image({
        image:  cfg.bridgeCanvas as any, // Konva accepts OffscreenCanvas
        width:  this.contentArea.width(),
        height: this.contentArea.height(),
      });
      this.contentArea.add(img);
    }

    // Only allow drag if click started on title background
    this.on('dragstart', (e) => {
      // getPointerPosition can return null if pointer is outside
      const pos = this.getStage()?.getPointerPosition();
      if (!pos) return;

      // Transform point to local coordinates relative to this group
      const localPos = this.getAbsoluteTransform().copy().invert().point(pos);
      
      // If the pointer is below the title bar, cancel the drag
      if (localPos.y > theme.titleBarHeight) {
        this.stopDrag();
      }
    });

    // Bring to front on click
    this.on('mousedown touchstart', () => {
      this.moveToTop();
    });
  }

  /** Helper to get content bounds for child layout. */
  get contentRect(): Rect {
    return {
      x: this.x() + this.contentArea.x(),
      y: this.y() + this.contentArea.y(),
      w: this.contentArea.width(),
      h: this.contentArea.height(),
    };
  }
}
