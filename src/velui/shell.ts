import Konva from 'konva';
import { Ui } from './ui';
import { Color, Theme } from './types';
import { VelLabel, VelContainer } from './widget/widgets';

export class StatusBar extends Konva.Group {
  private bg: VelContainer;
  private timeLabel: VelLabel;
  private timer: any;

  constructor(width: number, height: number, theme: Theme) {
    super();

    this.bg = new VelContainer({ x: 0, y: 0, w: width, h: height }, theme, { raised: true });
    // Remove corner radius for status bar
    this.bg.cornerRadius(0);
    this.add(this.bg);

    this.timeLabel = new VelLabel('', { x: width - 110, y: 0, w: 100, h: height }, theme);
    this.timeLabel.align('right');
    this.add(this.timeLabel);

    this.updateTime();
    this.timer = setInterval(() => this.updateTime(), 1000);
  }

  private updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.timeLabel.text(timeStr);
    this.getLayer()?.batchDraw();
  }

  setBarSize(w: number, h: number) {
    this.bg.width(w);
    this.bg.height(h);
    this.timeLabel.x(w - 110);
    this.timeLabel.width(100);
  }

  dispose() {
    clearInterval(this.timer);
    this.destroy();
  }
}

export class Shell {
  readonly ui: Ui;
  readonly wallpaperLayer: Konva.Layer;
  readonly windowLayer: Konva.Layer;
  readonly statusLayer: Konva.Layer;
  
  private statusBar: StatusBar;
  private wallpaper?: Konva.Rect;

  constructor(ui: Ui) {
    this.ui = ui;

    // 1. Layers
    this.wallpaperLayer = new Konva.Layer();
    this.windowLayer = new Konva.Layer();
    this.statusLayer = new Konva.Layer();

    // Re-order layers in the stage
    this.ui.stage.removeChildren();
    this.ui.stage.add(this.wallpaperLayer);
    this.ui.stage.add(this.windowLayer);
    this.ui.stage.add(this.statusLayer);

    // 2. Status Bar
    this.statusBar = new StatusBar(this.ui.width, 32, this.ui.theme);
    this.statusLayer.add(this.statusBar);

    // 3. Default Wallpaper
    this.setWallpaper(Color.toCss(this.ui.theme.bg));

    // 4. Resize handling
    window.addEventListener('resize', () => this.onResize());
  }

  setWallpaper(colorOrUrl: string) {
    if (this.wallpaper) {
      this.wallpaper.destroy();
    }

    if (colorOrUrl.startsWith('http') || colorOrUrl.startsWith('data:') || colorOrUrl.endsWith('.jpg') || colorOrUrl.endsWith('.png')) {
      Konva.Image.fromURL(colorOrUrl, (img) => {
        img.setAttrs({
          width: this.ui.width,
          height: this.ui.height,
        });
        this.wallpaperLayer.add(img);
        this.wallpaperLayer.batchDraw();
      });
    } else {
      this.wallpaper = new Konva.Rect({
        x: 0,
        y: 0,
        width: this.ui.width,
        height: this.ui.height,
        fill: colorOrUrl,
      });
      this.wallpaperLayer.add(this.wallpaper);
      this.wallpaperLayer.batchDraw();
    }
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (this.wallpaper) {
      this.wallpaper.width(w);
      this.wallpaper.height(h);
    }

    this.statusBar.setBarSize(w, 32);
    
    this.wallpaperLayer.batchDraw();
    this.windowLayer.batchDraw();
    this.statusLayer.batchDraw();
  }

  addWindow(win: Konva.Group) {
    this.windowLayer.add(win);
    this.windowLayer.batchDraw();
  }

  render() {
    this.wallpaperLayer.batchDraw();
    this.windowLayer.batchDraw();
    this.statusLayer.batchDraw();
  }
}
