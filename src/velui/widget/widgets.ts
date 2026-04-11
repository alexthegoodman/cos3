import Konva from 'konva';
import { Color, Rect, Theme } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Label
// ─────────────────────────────────────────────────────────────────────────────

export class VelLabel extends Konva.Text {
  constructor(text: string, rect: Rect, theme: Theme, color?: Color, fontSize?: number) {
    super({
      text:       text,
      x:          rect.x,
      y:          rect.y + (rect.h - (fontSize ?? theme.fontSize)) / 2,
      width:      rect.w,
      fontSize:   fontSize ?? theme.fontSize,
      fontFamily: 'sans-serif',
      fill:       Color.toCss(color ?? theme.text),
      align:      'left',
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────────────────────

export class VelButton extends Konva.Group {
  readonly rect: Konva.Rect;
  readonly text: Konva.Text;

  constructor(label: string, rect: Rect, theme: Theme) {
    super({
      x: rect.x,
      y: rect.y,
    });

    this.rect = new Konva.Rect({
      width:        rect.w,
      height:       rect.h,
      fill:         Color.toCss(theme.accent),
      cornerRadius: theme.radius,
    });
    this.add(this.rect);

    this.text = new Konva.Text({
      text:       label,
      width:      rect.w,
      height:     rect.h,
      fontSize:   theme.fontSize,
      fontFamily: 'sans-serif',
      fill:       Color.toCss(theme.text),
      align:      'center',
      verticalAlign: 'middle',
    });
    this.add(this.text);

    // Interactivity
    this.on('mouseenter', () => {
      this.rect.fill(Color.toCss(theme.accentHover));
      const stage = this.getStage();
      if (stage) stage.container().style.cursor = 'pointer';
      this.getLayer()?.batchDraw();
    });
    this.on('mouseleave', () => {
      this.rect.fill(Color.toCss(theme.accent));
      const stage = this.getStage();
      if (stage) stage.container().style.cursor = 'default';
      this.getLayer()?.batchDraw();
    });
    this.on('mousedown', () => {
      this.rect.fill(Color.toCss(theme.accentPress));
      this.getLayer()?.batchDraw();
    });
    this.on('mouseup', () => {
      this.rect.fill(Color.toCss(theme.accentHover));
      this.getLayer()?.batchDraw();
    });
  }

  updateStyle(fill: string, textColor: string) {
    this.rect.fill(fill);
    this.text.fill(textColor);
    this.getLayer()?.batchDraw();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

export class VelTabs extends Konva.Group {
  private activeIndex: number = 0;
  private buttons: VelButton[] = [];

  constructor(labels: string[], rect: Rect, theme: Theme, onChange: (index: number) => void) {
    super({ x: rect.x, y: rect.y });

    const tabW = rect.w / labels.length;
    labels.forEach((label, i) => {
      const btn = new VelButton(label, { x: i * tabW, y: 0, w: tabW, h: rect.h }, theme);
      
      const refreshStyle = () => {
        const active = i === this.activeIndex;
        btn.updateStyle(
          Color.toCss(active ? theme.surfaceRaised : theme.surface),
          Color.toCss(active ? theme.text : theme.textDim)
        );
      };

      btn.on('click tap', () => {
        this.activeIndex = i;
        this.buttons.forEach((b: any) => b.refreshStyle?.());
        onChange(i);
      });

      (btn as any).refreshStyle = refreshStyle;
      refreshStyle();
      
      this.add(btn);
      this.buttons.push(btn);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Container
// ─────────────────────────────────────────────────────────────────────────────

export class VelContainer extends Konva.Rect {
  constructor(rect: Rect, theme: Theme, opts: { raised?: boolean; border?: boolean } = {}) {
    super({
      x:            rect.x,
      y:            rect.y,
      width:        rect.w,
      height:       rect.h,
      fill:         Color.toCss(opts.raised ? theme.surfaceRaised : theme.surface),
      cornerRadius: theme.radius,
      stroke:       opts.border ? Color.toCss(theme.border) : undefined,
      strokeWidth:  opts.border ? theme.borderWidth : 0,
    });
  }
}
