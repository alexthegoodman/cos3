import Konva from 'konva';
import { Ui } from './ui';
import { Color, Theme, Rect, LayoutMode } from './types';
import { VelLabel, VelContainer, VelButton, VelDropdown } from './widget/widgets';
import { MINI_H, VelWindow } from './widget/window';
import { AppLauncher } from './widget/launcher';
import { AppManager } from '../sdk/app-manager';
import { globalRegistry } from '../sdk/registry';
import type { UINode, AppId } from '../sdk/types';
import { LayoutCursor, GridCursor, HCursor } from './layout';

// ─────────────────────────────────────────────────────────────────────────────
// StatusBar
// ─────────────────────────────────────────────────────────────────────────────

export class StatusBar extends Konva.Group {
  private bg: VelContainer;
  private timeLabel: VelLabel;
  private weatherLabel: VelLabel;
  private startBtn: VelButton;
  private notifBtn: VelButton;
  private fullscreenBtn: VelButton;
  private layoutDropdown: VelDropdown;
  private wallpaperDropdown: VelDropdown;
  private timer: any;

  constructor(width: number, height: number, theme: Theme, onStartClick: () => void, onLayoutChange: (mode: LayoutMode) => void, onWallpaperChange: (type: string) => void) {
    super();

    // notifications bar
    this.bg = new VelContainer({ x: (width / 2) - 70, y: 10, w: 180, h: height }, theme, { raised: true });
    this.bg.cornerRadius(25);
    this.add(this.bg);

    // center dock buttons
    const lightGray = { r: 70, g: 70, b: 70, a: 255 };
    const dockX = (width / 2);
    this.startBtn = new VelButton('Apps', {  x: dockX - 175, y: 14, w: 90, h: height - 8 }, { ...theme, accent: lightGray });
    this.startBtn.rect.cornerRadius(25);
    this.startBtn.on('click tap', onStartClick);
    this.add(this.startBtn);

    this.notifBtn = new VelButton('x', {  x: (width / 2) - 40, y: 14, w: height - 8, h: height - 8 }, { ...theme, accent: lightGray });
    this.notifBtn.rect.cornerRadius(25);
    this.notifBtn.on('click tap', onStartClick);
    this.add(this.notifBtn);

    this.notifBtn = new VelButton('x', {  x: (width / 2) - 10, y: 14, w: height - 8, h: height - 8 }, { ...theme, accent: lightGray });
    this.notifBtn.rect.cornerRadius(25);
    this.notifBtn.on('click tap', onStartClick);
    this.add(this.notifBtn);

    this.notifBtn = new VelButton('x', {  x: (width / 2) + 20, y: 14, w: height - 8, h: height - 8 }, { ...theme, accent: lightGray });
    this.notifBtn.rect.cornerRadius(25);
    this.notifBtn.on('click tap', onStartClick);
    this.add(this.notifBtn);

    this.notifBtn = new VelButton('x', {  x: (width / 2) + 50, y: 14, w: height - 8, h: height - 8 }, { ...theme, accent: lightGray });
    this.notifBtn.rect.cornerRadius(25);
    this.notifBtn.on('click tap', onStartClick);
    this.add(this.notifBtn);

    // Layout Dropdown
    this.layoutDropdown = new VelDropdown('Layout: Freeform', [LayoutMode.FREEFORM, LayoutMode.MAX_1, LayoutMode.MAX_2], { x: 20, y: 10, w: 150, h: height }, { ...theme, accent: lightGray }, (mode) => {
      this.layoutDropdown.setLabel(`Layout: ${mode}`);
      onLayoutChange(mode as LayoutMode);
    });
    this.add(this.layoutDropdown);

    // Fullscreen Button
    this.fullscreenBtn = new VelButton('Fullscreen', { x: 180, y: 10, w: 90, h: height }, { ...theme, accent: lightGray });
    this.fullscreenBtn.on('click tap', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });
    this.add(this.fullscreenBtn);

    // Wallpaper Dropdown
    this.wallpaperDropdown = new VelDropdown('Wall: Static', ['Static', 'Aurora', 'Nebula', 'Cosmic'], { x: 280, y: 10, w: 100, h: height }, { ...theme, accent: lightGray }, (type) => {
      this.wallpaperDropdown.setLabel(`Wall: ${type}`);
      onWallpaperChange(type.toLowerCase());
    });
    this.add(this.wallpaperDropdown);

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

interface AnyCursor {
  next(hOrW: number): Rect;
}

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
      
      win.onClose = () => {
        this.windows.delete(appId);
        this.shell.onWindowClosed(appId);
      };

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
        this.renderNode(appId, child, win.contentArea, cur);
      }
    }
  }

  private renderNode(appId: AppId, node: UINode, parent: Konva.Group, cur: AnyCursor) {
    const theme = this.shell.ui.theme;
    const props = node.props || {};

    switch (node.type) {
      case 'text': {
        const h = (props.size as number) || 20;
        const rect = cur.next(h);
        const label = new VelLabel((props.content as string) || '', rect, theme, props.color as any, h);
        if (props.align) label.align(props.align as string);
        parent.add(label);
        break;
      }
      
      case 'button': {
        const h = (props.height as number) || 40;
        const btn = new VelButton((props.label as string) || 'Button', cur.next(h), theme);
        if (props.onClick) {
          btn.on('click tap', () => {
            this.shell.onUIEvent(appId, props.onClick as string, {});
          });
        }
        parent.add(btn);
        break;
      }

      case 'container': {
        const layout = (props.layout as string) || 'column';
        const gap = (props.gap as number) ?? theme.gap;
        const padding = (props.padding as number) ?? 0;
        
        // Determine container height
        const height = (props.height as number) || 100; // default for row
        
        let containerCur: AnyCursor;
        const bounds = cur.next(height);

        if (layout === 'grid') {
          const cols = (props.cols as number) || 4;
          containerCur = new GridCursor(bounds, cols, padding, gap);
        } else if (layout === 'row') {
          containerCur = new HCursor(bounds.x + padding, bounds.y + padding, bounds.h - padding * 2, gap);
        } else {
          containerCur = new LayoutCursor(bounds, padding, gap);
        }

        if (node.children) {
          for (const child of node.children) {
            this.renderNode(appId, child, parent, containerCur);
          }
        }
        break;
      }
      
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
             name: 'gpu-scene-image',
             renderer: props.renderer,
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
  readonly overlayLayer: Konva.Layer;
  
  private statusBar: StatusBar;
  private launcher?: AppLauncher;
  private wallpaper?: Konva.Rect | Konva.Image;
  private bridge: UIBridge;
  private layoutMode: LayoutMode = LayoutMode.FREEFORM;
  private appManager?: AppManager;
  private currentWallpaperType: string = 'static';
  private shaderBridge?: { canvas: OffscreenCanvas, ctx: GPUCanvasContext };

  constructor(ui: Ui) {
    this.ui = ui;
    this.bridge = new UIBridge(this);

    // 1. Layers
    this.wallpaperLayer = new Konva.Layer();
    this.windowLayer = new Konva.Layer();
    this.statusLayer = new Konva.Layer();
    this.overlayLayer = new Konva.Layer();

    this.ui.stage.removeChildren();
    this.ui.stage.add(this.wallpaperLayer);
    this.ui.stage.add(this.windowLayer);
    this.ui.stage.add(this.statusLayer);
    this.ui.stage.add(this.overlayLayer);

    // 2. Status Bar
    this.statusBar = new StatusBar(this.ui.width, 32, this.ui.theme, () => {
      this.launcher?.toggle();
    }, (mode) => {
      this.setLayoutMode(mode);
    }, (type) => {
      this.setWallpaperType(type);
    });
    this.statusLayer.add(this.statusBar);

    // 3. Default Wallpaper
    this.setWallpaper(Color.toCss(this.ui.theme.bg));

    window.addEventListener('resize', () => this.onResize());

    // Listen for window interactions to re-apply layout if needed
    this.windowLayer.on('mousedown touchstart', (e) => {
      const win = e.target.findAncestor('.vel-window') as VelWindow;
      if (win) {
        // Delay to allow moveToTop and other logic to complete
        setTimeout(() => this.applyLayout(), 0);
      }
    });

    // Close launcher when clicking on wallpaper
    this.wallpaperLayer.on('mousedown touchstart', () => {
      this.launcher?.hide();
    });
  }

  onWindowClosed(appId: AppId) {
    if (this.appManager?.isRunning(appId)) {
      this.appManager.terminateApp(appId);
    }
    this.applyLayout();
  }

  onUIEvent(appId: AppId, handlerName: string, data: any) {
    this.appManager?.callExport(appId, handlerName, data);
  }

  setAppManager(manager: AppManager, launchCallback: (appId: AppId) => void) {
    this.appManager = manager;
    
    // Create launcher
    const launcherW = Math.min(600, this.ui.width - 40);
    const launcherH = Math.min(400, this.ui.height - 100);
    
    this.launcher = new AppLauncher(
      { 
        x: (this.ui.width - launcherW) / 2, 
        y: 60, 
        w: launcherW, 
        h: launcherH 
      }, 
      this.ui.theme, 
      manager.listApps(),
      (appId) => {
        launchCallback(appId);
        this.launcher?.hide();
      }
    );
    this.overlayLayer.add(this.launcher);
  }

  setLayoutMode(mode: LayoutMode) {
    this.layoutMode = mode;
    this.applyLayout();
  }

  setWallpaperType(type: string) {
    this.currentWallpaperType = type;
    if (type === 'static') {
      this.setWallpaper(Color.toCss(this.ui.theme.bg));
    } else {
      this.setupShaderWallpaper();
    }
  }

  private setupShaderWallpaper() {
    if (this.wallpaper) {
      this.wallpaper.destroy();
    }
    
    if (!this.shaderBridge) {
      this.shaderBridge = this.ui.gpu.createBridgeCanvas(this.ui.width, this.ui.height);
    }

    const img = new Konva.Image({
      x: 0, y: 0, 
      width: this.ui.width, 
      height: this.ui.height,
      image: this.shaderBridge.canvas as any,
    });
    this.wallpaper = img;
    this.wallpaperLayer.add(img);
    this.wallpaperLayer.batchDraw();
  }

  applyLayout() {
    const windows = (this.windowLayer.getChildren().filter(c => c.name() === 'vel-window') as VelWindow[])
      .filter(w => !w.isMinimised);
      
    if (this.layoutMode === LayoutMode.FREEFORM) {
      windows.forEach(w => w.restoreManualSize(this.ui.theme));
      this.render();
      return;
    }

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const statusH = 32 + 30; // including margin
    const margin = 10;
    const availableH = screenH - statusH - margin - MINI_H - 30;
    const topY = statusH;

    // Sort by Z-index (last is top)
    const sortedWindows = [...windows].sort((a, b) => b.zIndex() - a.zIndex());

    if (this.layoutMode === LayoutMode.MAX_1) {
      sortedWindows.forEach((w, i) => {
        if (i === 0) {
          w.draggable(false);
          w.setLayoutRect(margin, topY, screenW - margin * 2, availableH);
        } else {
          // Minimise others if they are not already
          w.minimise(this.ui.theme);
        }
      });
    } else if (this.layoutMode === LayoutMode.MAX_2) {
      const count = Math.min(sortedWindows.length, 2);
      const winW = (screenW - margin * (count + 1)) / count;
      
      sortedWindows.forEach((w, i) => {
        if (i < 2) {
          w.draggable(false);
          w.setLayoutRect(margin + i * (winW + margin), topY, winW, availableH);
        } else {
          w.minimise(this.ui.theme);
        }
      });
    }

    this.render();
  }

  setWallpaper(colorOrUrl: string) {
    if (this.wallpaper) {
      this.wallpaper.destroy();
    }

    if (colorOrUrl.startsWith('http') || colorOrUrl.startsWith('data:') || colorOrUrl.endsWith('.jpg') || colorOrUrl.endsWith('.png')) {
      Konva.Image.fromURL(colorOrUrl, (img) => {
        img.setAttrs({ width: this.ui.width, height: this.ui.height });
        this.wallpaper = img;
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
    if (this.shaderBridge) {
      this.ui.gpu.resizeBridgeCanvas(this.shaderBridge, w, h);
    }
    this.statusBar.setBarSize(w, 32);
    this.applyLayout();
  }

  addWindow(win: VelWindow) {
    this.windowLayer.add(win);
    this.applyLayout();
  }

  update(dt: number) {
    let changed = false;
    const windows = this.windowLayer.getChildren().filter(c => c.name() === 'vel-window') as VelWindow[];
    windows.forEach(win => {
      if (win.update(dt, this.ui.theme)) {
        changed = true;
      }
    });

    if (this.launcher?.update(dt)) {
      this.overlayLayer.batchDraw();
    }

    if (this.currentWallpaperType !== 'static') {
      changed = true; // Always redraw if shader is running
    }

    if (changed) {
      this.windowLayer.batchDraw();
      if (this.currentWallpaperType !== 'static') {
        this.wallpaperLayer.batchDraw();
      }
    }
  }

  render() {
    this.wallpaperLayer.batchDraw();
    this.windowLayer.batchDraw();
    this.statusLayer.batchDraw();
    this.overlayLayer.batchDraw();
  }

  getUIBridge() {
    return this.bridge;
  }

  getWallpaperState() {
    return {
      type: this.currentWallpaperType,
      bridge: this.shaderBridge
    };
  }
}
