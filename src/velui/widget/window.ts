import Konva from 'konva';
import type { Rect, Theme } from '../types';
import { Color } from '../types';
import { Spring } from '../anim';

export interface WindowConfig {
  title:         string;
  x:             number;
  y:             number;
  width:         number;
  height:        number;
  draggable?:    boolean;
  closable?:     boolean;
  minimisable?:  boolean;
  /** If provided, this image/canvas will be displayed in the content area. */
  sourceImage?:  ImageBitmap;
  bridgeCanvas?: OffscreenCanvas | HTMLCanvasElement | null;
}

export const MINI_W = 180;
export const MINI_H = 128;

/**
 * VelWindow — a persistent Konva.Group representing a UI window.
 */
export class VelWindow extends Konva.Group {
  readonly background:  Konva.Rect;
  readonly titleBar:    Konva.Group;
  readonly titleText:   Konva.Text;
  readonly contentArea: Konva.Group;
  readonly closeBtn:    Konva.Circle;
  readonly miniBtn:     Konva.Circle;
  readonly resizeHandle: Konva.Group;

  private _isMinimised = false;
  private _manualRect: { x: number, y: number, w: number, h: number };
  
  // Animation Springs
  private springX: Spring;
  private springY: Spring;
  private springW: Spring;
  private springH: Spring;
  private springContentScale: Spring;
  private springOpacity: Spring;

  onClose?: () => void;

  constructor(cfg: WindowConfig, theme: Theme) {
    super({
      x:         cfg.x,
      y:         cfg.y,
      draggable: cfg.draggable ?? true,
      name:      'vel-window',
    });

    this._manualRect = { x: cfg.x, y: cfg.y, w: cfg.width, h: cfg.height };

    // Initialize Springs
    this.springX = Spring.gentle(cfg.x);
    this.springY = Spring.gentle(cfg.y);
    this.springW = Spring.gentle(cfg.width);
    this.springH = Spring.gentle(cfg.height);
    this.springContentScale = Spring.gentle(0); // Start small for "launch" effect
    this.springOpacity = Spring.gentle(0);

    // Initial targets for entrance animation
    this.springContentScale.snap(0.5);
    this.springContentScale.value = 0.5;
    this.springOpacity.value = 0;
    
    // Set final targets
    this.springContentScale.update(1, 0); 
    this.springOpacity.update(1, 0);

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
      fontFamily: 'Sofia Sans',
      fill:       Color.toCss(theme.text),
      x:          theme.padding,
      y:          (theme.titleBarHeight - theme.fontSizeTitle) / 2,
      listening:  false,
    });
    this.titleBar.add(this.titleText);

    // 3. Traffic Light Buttons
    this.closeBtn = new Konva.Circle({
      x:      cfg.width - 20,
      y:      theme.titleBarHeight / 2,
      radius: 6,
      fill:   '#ff5f57', // Red
    });
    this.closeBtn.on('click tap', (e) => {
      e.cancelBubble = true;
      this.onClose?.();
      this.destroy();
    });
    this.titleBar.add(this.closeBtn);

    this.miniBtn = new Konva.Circle({
      x:      cfg.width - 40,
      y:      theme.titleBarHeight / 2,
      radius: 6,
      fill:   '#febc2e', // Yellow
    });
    this.miniBtn.on('click tap', (e) => {
      e.cancelBubble = true;
      this.minimise(theme);
    });
    this.titleBar.add(this.miniBtn);

    // 4. Content Area (Clipped)
    this.contentArea = new Konva.Group({
      x:      1,
      y:      theme.titleBarHeight,
      width:  cfg.width - 2,
      height: cfg.height - theme.titleBarHeight - 1,
      clipFunc: (ctx) => {
        ctx.rect(0, 0, this.contentArea.width(), this.contentArea.height());
      },
    });
    this.add(this.contentArea);

    // 5. Resize Handle
    this.resizeHandle = new Konva.Group({
      x: cfg.width - 20,
      y: cfg.height - 20,
      width: 20,
      height: 20,
      draggable: true,
    });
    this.add(this.resizeHandle);

    // Visible indicator (small triangle lines)
    const line1 = new Konva.Line({
      points: [10, 20, 20, 10],
      stroke: Color.toCss(theme.textDim),
      strokeWidth: 1,
      listening: false,
    });
    const line2 = new Konva.Line({
      points: [15, 20, 20, 15],
      stroke: Color.toCss(theme.textDim),
      strokeWidth: 1,
      listening: false,
    });
    this.resizeHandle.add(line1, line2);

    // Invisible hit area
    const hitArea = new Konva.Rect({
      width: 20,
      height: 20,
      fill: 'transparent',
    });
    this.resizeHandle.add(hitArea);

    this.resizeHandle.on('dragstart', (e) => {
      e.cancelBubble = true;
    });

    this.resizeHandle.on('mouseenter', () => {
      const stage = this.getStage();
      if (stage) stage.container().style.cursor = 'nwse-resize';
      line1.stroke(Color.toCss(theme.text));
      line2.stroke(Color.toCss(theme.text));
      this.getLayer()?.batchDraw();
    });
    this.resizeHandle.on('mouseleave', () => {
      const stage = this.getStage();
      if (stage) stage.container().style.cursor = 'default';
      line1.stroke(Color.toCss(theme.textDim));
      line2.stroke(Color.toCss(theme.textDim));
      this.getLayer()?.batchDraw();
    });

    this.resizeHandle.on('dragmove', () => {
      const newW = Math.max(200, this.resizeHandle.x() + 20);
      const newH = Math.max(100, this.resizeHandle.y() + 20);
      
      this.resizeImmediate(newW, newH, theme);
      this._manualRect.w = newW;
      this._manualRect.h = newH;
      
      // Sync springs
      this.springW.snap(newW);
      this.springH.snap(newH);

      // Reset handle position relative to window
      this.resizeHandle.x(this.background.width() - 20);
      this.resizeHandle.y(this.background.height() - 20);
      
      this.getLayer()?.batchDraw();
    });

    // 6. Optional WebGPU Bridge
    if (cfg.sourceImage) {
      this.setContentImage(cfg.sourceImage);
    }

    if (cfg.bridgeCanvas) {
      const img = new Konva.Image({
        image:  cfg.bridgeCanvas as any,
        width:  this.contentArea.width(),
        height: this.contentArea.height(),
        name:   'content-image',
      });
      this.contentArea.add(img);
    }

    // Drag start restriction
    this.on('dragstart', () => {
      if (this._isMinimised) {
        this.stopDrag();
        return;
      }
      const pos = this.getStage()?.getPointerPosition();
      if (!pos) return;
      const localPos = this.getAbsoluteTransform().copy().invert().point(pos);
      if (localPos.y > theme.titleBarHeight) {
        this.stopDrag();
      }
    });

    this.on('dragmove', () => {
      if (!this._isMinimised) {
        this._manualRect.x = this.x();
        this._manualRect.y = this.y();
        this.springX.snap(this.x());
        this.springY.snap(this.y());
      }
    });

    // Restore on click if minimised
    this.on('mousedown touchstart', () => {
      this.moveToTop();
      if (this._isMinimised) {
        this.restore(theme);
      }
    });
  }

  update(dt: number, theme: Theme): boolean {
    let changed = false;

    if (this._isMinimised) {
      const stage = this.getStage();
      if (stage) {
        const windows = stage.find('.vel-window') as VelWindow[];
        const minimised = windows.filter(w => w.isMinimised);
        const myIndex = minimised.indexOf(this);
        if (myIndex !== -1) {
          const slotX = 16 + myIndex * (MINI_W + 8);
          const slotY = stage.height() - MINI_H - 16;
          changed = this.springX.update(slotX, dt) || changed;
          changed = this.springY.update(slotY, dt) || changed;
        }
      }
      changed = this.springW.update(MINI_W, dt) || changed;
      changed = this.springH.update(MINI_H, dt) || changed;

      // Scale content to fit
      const scaleX = MINI_W / this._manualRect.w;
      const scaleY = MINI_H / (this._manualRect.h - theme.titleBarHeight);
      const scale = Math.min(scaleX, scaleY);
      changed = this.springContentScale.update(scale, dt) || changed;
    } else {
      changed = this.springX.update(this._manualRect.x, dt) || changed;
      changed = this.springY.update(this._manualRect.y, dt) || changed;
      changed = this.springW.update(this._manualRect.w, dt) || changed;
      changed = this.springH.update(this._manualRect.h, dt) || changed;
      changed = this.springContentScale.update(1, dt) || changed;
    }

    changed = this.springOpacity.update(1, dt) || changed;

    if (changed) {
      this.x(this.springX.value);
      this.y(this.springY.value);
      this.opacity(this.springOpacity.value);
      this.resizeImmediate(this.springW.value, this.springH.value, theme);

      const s = this.springContentScale.value;
      this.contentArea.scale({ x: s, y: s });
      
      if (this._isMinimised) {
        this.contentArea.position({ 
          x: (this.springW.value - this.contentArea.width() * s) / 2, 
          y: (this.springH.value - this.contentArea.height() * s) / 2 
        });
      } else {
        this.contentArea.position({ x: 1, y: theme.titleBarHeight });
      }
    }

    return changed;
  }

  minimise(theme: Theme) {
    if (this._isMinimised) return;
    this._isMinimised = true;

    // Hide decorations
    this.draggable(false);
    this.titleBar.visible(false);
    this.resizeHandle.visible(false);
    this.background.fill(Color.toCss(theme.surfaceRaised));
  }

  restore(theme: Theme) {
    if (!this._isMinimised) return;
    this._isMinimised = false;

    this.draggable(true);
    this.titleBar.visible(true);
    this.resizeHandle.visible(true);
    this.background.fill(Color.toCss(theme.surface));
    
    this.realignMinimizedWindows();
  }

  restoreManualSize(theme: Theme) {
    this.draggable(true);
    this._isMinimised = false;
    this.titleBar.visible(true);
    this.resizeHandle.visible(true);
    this.background.fill(Color.toCss(theme.surface));
  }

  setLayoutRect(x: number, y: number, w: number, h: number) {
    this._manualRect = { x, y, w, h };
  }

  resize(w: number, h: number, theme: Theme) {
    this._manualRect.w = w;
    this._manualRect.h = h;
  }

  private resizeImmediate(w: number, h: number, theme: Theme) {
    this.background.width(w);
    this.background.height(h);

    const titleBg = this.titleBar.findOne('.title-bg') as Konva.Rect;
    if (titleBg) titleBg.width(w);
    this.titleBar.width(w);

    this.closeBtn.x(w - 20);
    this.miniBtn.x(w - 40);

    // We don't resize content area width/height here as it depends on scale
    // but we update the logical size it should have when scale is 1
    if (!this._isMinimised) {
      this.contentArea.width(w - 2);
      this.contentArea.height(h - theme.titleBarHeight - 1);

      // Update content images if they exist
      this.contentArea.find('Image').forEach((img: any) => {
        img.width(this.contentArea.width());
        img.height(this.contentArea.height());
      });
    }

    this.resizeHandle.x(w - 20);
    this.resizeHandle.y(h - 20);
  }

  private realignMinimizedWindows() {
    // This is now handled in update()
  }

  get isMinimised() { return this._isMinimised; }

  get contentRect(): Rect {
    return {
      x: this.x() + this.contentArea.x(),
      y: this.y() + this.contentArea.y(),
      w: this.contentArea.width() * this.contentArea.scaleX(),
      h: this.contentArea.height() * this.contentArea.scaleY(),
    };
  }

  /** Update or set the content image (e.g. from WebGPU ImageBitmap). */
  setContentImage(source: ImageBitmap | OffscreenCanvas | HTMLCanvasElement) {
    let img = this.contentArea.findOne('.content-image') as Konva.Image;
    if (img) {
      img.image(source as any);
    } else {
      img = new Konva.Image({
        image:  source as any,
        width:  this.contentArea.width(),
        height: this.contentArea.height(),
        name:   'content-image',
      });
      this.contentArea.add(img);
    }
  }
}
