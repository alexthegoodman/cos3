import Konva from 'konva';
import { Color, Rect, Theme } from '../types';
import { VelContainer, VelButton, VelLabel } from './widgets';
import type { AppManifest } from '../../sdk/types';
import { Spring } from '../anim';

export class AppLauncher extends Konva.Group {
  private bg: VelContainer;
  private grid: Konva.Group;
  private spring: Spring;
  private _targetVisible = false;

  constructor(rect: Rect, theme: Theme, apps: AppManifest[], onLaunch: (appId: string) => void) {
    super({ x: rect.x, y: rect.y, visible: false, opacity: 0, scaleX: 0.9, scaleY: 0.9 });

    this.spring = Spring.gentle(0);

    // Background with a bit of transparency
    this.bg = new VelContainer({ x: 0, y: 0, w: rect.w, h: rect.h }, theme, { raised: true });
    this.bg.opacity(0.95);
    this.bg.cornerRadius(20);
    this.add(this.bg);

    const title = new VelLabel('Applications', { x: 20, y: 20, w: rect.w - 40, h: 40 }, theme, undefined, 24);
    this.add(title);

    this.grid = new Konva.Group({ x: 20, y: 80 });
    this.add(this.grid);

    const iconSize = 80;
    const gap = 20;
    const cols = Math.floor((rect.w - 40) / (iconSize + gap));

    apps.forEach((app, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const appGroup = new Konva.Group({
        x: col * (iconSize + gap),
        y: row * (iconSize + gap + 20),
      });

      const btn = new VelButton('', { x: 0, y: 0, w: iconSize, h: iconSize }, theme);
      btn.rect.cornerRadius(15);
      
      // Placeholder icon - just a colored circle for now
      const icon = new Konva.Circle({
        x: iconSize / 2,
        y: iconSize / 2,
        radius: iconSize / 3,
        fill: Color.toCss(theme.accent),
      });
      btn.add(icon);

      btn.on('click tap', () => {
        onLaunch(app.id);
      });

      const label = new VelLabel(app.name, { x: 0, y: iconSize + 5, w: iconSize, h: 20 }, theme, theme.text, 12);
      label.align('center');

      appGroup.add(btn);
      appGroup.add(label);
      this.grid.add(appGroup);
    });
  }

  update(dt: number): boolean {
    const changed = this.spring.update(this._targetVisible ? 1 : 0, dt);
    if (changed || this.spring.value > 0) {
      this.opacity(this.spring.value);
      const s = 0.9 + 0.1 * this.spring.value;
      this.scale({ x: s, y: s });
      this.visible(this.spring.value > 0.01);
    }
    return changed;
  }

  toggle() {
    if (this._targetVisible) this.hide();
    else this.show();
  }

  show() {
    this._targetVisible = true;
    this.visible(true);
    this.moveToTop();
    this.getLayer()?.batchDraw();
  }

  hide() {
    this._targetVisible = false;
    this.getLayer()?.batchDraw();
  }
}
