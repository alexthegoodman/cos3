import Konva from 'konva';
import { Ui } from './ui';
import { Color, Theme, Rect } from './types';
import { VelLabel, VelContainer, VelButton } from './widget/widgets';
import { VelWindow } from './widget/window';
import { AppManager } from '../sdk/app-manager';
import { globalRegistry } from '../sdk/registry';
import type { UINode, AppId } from '../sdk/types';
import { LayoutCursor } from './layout';

// ─────────────────────────────────────────────────────────────────────────────
// StatusBar
// ─────────────────────────────────────────────────────────────────────────────

export class StatusBar extends Konva.Group {
  private bg: VelContainer;
  private timeLabel: VelLabel;
  private weatherLabel: VelLabel;
  private startBtn: VelButton;
  private timer: any;

  constructor(width: number, height: number, theme: Theme, onStartClick: () => void) {
    super();

    // notifications bar
    this.bg = new VelContainer({ x: (width / 2) - 100, y: 10, w: 200, h: height }, theme, { raised: true });
    this.bg.cornerRadius(25);
    this.add(this.bg);

    let lightGray = { r: 70, g: 70, b: 70, a: 255 };

    this.startBtn = new VelButton('x', {  x: (width / 2) - 60, y: 14, w: height - 8, h: height - 8 }, { ...theme, accent: lightGray });
    this.startBtn.rect.cornerRadius(25);
    this.startBtn.on('click tap', onStartClick);
    this.add(this.startBtn);

    this.startBtn = new VelButton('x', {  x: (width / 2) - 30, y: 14, w: height - 8, h: height - 8 }, { ...theme, accent: lightGray });
    this.startBtn.rect.cornerRadius(25);
    this.startBtn.on('click tap', onStartClick);
    this.add(this.startBtn);

    this.startBtn = new VelButton('x', {  x: (width / 2), y: 14, w: height - 8, h: height - 8 }, { ...theme, accent: lightGray });
    this.startBtn.rect.cornerRadius(25);
    this.startBtn.on('click tap', onStartClick);
    this.add(this.startBtn);

    this.startBtn = new VelButton('x', {  x: (width / 2) + 30, y: 14, w: height - 8, h: height - 8 }, { ...theme, accent: lightGray });
    this.startBtn.rect.cornerRadius(25);
    this.startBtn.on('click tap', onStartClick);
    this.add(this.startBtn);

    // time and weather
    this.timeLabel = new VelLabel('', { x: width - 125, y: 15, w: 100, h: height }, { ...theme, fontSize: 20 });
    this.timeLabel.align('right');
    this.add(this.timeLabel);

    let lightGray2 = { r: 170, g: 170, b: 170, a: 255 };

    this.weatherLabel = new VelLabel('72 F, Sunny', { x: width - 125, y: 37, w: 100, h: height }, { ...theme, fontSize: 16, text: lightGray2 });
    this.weatherLabel.align('right');
    this.add(this.weatherLabel);

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

// ─────────────────────────────────────────────────────────────────────────────
// UI Bridge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connects App SDK UI calls to Konva widgets.
 */
export class UIBridge {
  private windows = new Map<AppId, VelWindow>();

  constructor(private shell: Shell) {}

  render(appId: AppId, node: UINode) {
    if (node.type === 'window') {
      this.renderWindow(appId, node);
    }
  }

  private renderWindow(appId: AppId, node: UINode) {
    const props = node.props || {};
    const title = (props.title as string) || appId;
    const width = (props.width as number) || 400;
    const height = (props.height as number) || 300;

    let win = this.windows.get(appId);
    if (!win) {
      win = new VelWindow({
        title,
        x: 100 + this.windows.size * 240,
        y: 100 + this.windows.size * 40,
        width,
        height,
      }, this.shell.ui.theme);
      this.shell.addWindow(win);
      this.windows.set(appId, win);
    }

    win.contentArea.destroyChildren();
    
    const cur = new LayoutCursor(
      { x: 0, y: 0, w: win.contentArea.width(), h: win.contentArea.height() },
      this.shell.ui.theme.padding, this.shell.ui.theme.gap
    );

    if (node.children) {
      for (const child of node.children) {
        this.renderNode(child, win.contentArea, cur);
      }
    }
  }

  private renderNode(node: UINode, parent: Konva.Group, cur: LayoutCursor) {
    const theme = this.shell.ui.theme;
    const props = node.props || {};

    switch (node.type) {
      case 'text':
        const label = new VelLabel((props.content as string) || '', cur.next(props.size as number || 20), theme);
        parent.add(label);
        break;
      
      case 'button':
        const btn = new VelButton((props.label as string) || 'Button', cur.next(40), theme);
        parent.add(btn);
        break;

      case 'container':
        // Simplified container
        if (node.children) {
          for (const child of node.children) {
            this.renderNode(child, parent, cur);
          }
        }
        break;
      
      case 'image':
        if (props.src === 'gpu-scene') {
           // Dynamic WebGPU Scene placeholder
           const layout = cur.next(300);
           const bridge = this.shell.ui.gpu.createBridgeCanvas(layout.w, layout.h);
           const img = new Konva.Image({
             image: bridge.canvas,
             x: layout.x,
             y: layout.y,
             width: layout.w,
             height: layout.h,
             name: 'gpu-scene-image'
           });
           parent.add(img);
           
           // Store bridge info for the render loop
           (img as any)._gpuBridge = bridge;
           (img as any)._sceneName = props.sceneName;
        }
        break;
    }
  }

  getWindows() {
    return Array.from(this.windows.values());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

export class Shell {
  readonly ui: Ui;
  readonly wallpaperLayer: Konva.Layer;
  readonly windowLayer: Konva.Layer;
  readonly statusLayer: Konva.Layer;
  
  private statusBar: StatusBar;
  private wallpaper?: Konva.Rect;
  private bridge: UIBridge;

  constructor(ui: Ui) {
    this.ui = ui;
    this.bridge = new UIBridge(this);

    // 1. Layers
    this.wallpaperLayer = new Konva.Layer();
    this.windowLayer = new Konva.Layer();
    this.statusLayer = new Konva.Layer();

    this.ui.stage.removeChildren();
    this.ui.stage.add(this.wallpaperLayer);
    this.ui.stage.add(this.windowLayer);
    this.ui.stage.add(this.statusLayer);

    // 2. Status Bar
    this.statusBar = new StatusBar(this.ui.width, 32, this.ui.theme, () => {
      console.log('Start menu clicked');
    });
    this.statusLayer.add(this.statusBar);

    // 3. Default Wallpaper
    this.setWallpaper(Color.toCss(this.ui.theme.bg));

    window.addEventListener('resize', () => this.onResize());
  }

  setWallpaper(colorOrUrl: string) {
    if (this.wallpaper) {
      this.wallpaper.destroy();
    }

    if (colorOrUrl.startsWith('http') || colorOrUrl.startsWith('data:') || colorOrUrl.endsWith('.jpg') || colorOrUrl.endsWith('.png')) {
      Konva.Image.fromURL(colorOrUrl, (img) => {
        img.setAttrs({ width: this.ui.width, height: this.ui.height });
        this.wallpaperLayer.add(img);
        this.wallpaperLayer.batchDraw();
      });
    } else {
      this.wallpaper = new Konva.Rect({
        x: 0, y: 0, width: this.ui.width, height: this.ui.height,
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
    this.render();
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

  getUIBridge() {
    return this.bridge;
  }
}
