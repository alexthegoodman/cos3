import { Ui, Window, Button, Label, RectUtils } from '../velui';
import { AppManifest, WindowOptions } from './api';
import { Rect } from '../velui/types';

export class Bridge {
  private ui: Ui;
  private windows: Map<string, Window> = new Map();
  private widgets: Map<string, any> = new Map();
  private eventHandlers: Map<string, (data?: any) => void> = new Map();

  constructor(ui: Ui) {
    this.ui = ui;
  }

  generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }

  async createWindow(appId: string, options: WindowOptions): Promise<string> {
    const id = this.generateId();
    const win = new Window({
      title:  options.title,
      x:      options.x ?? 100,
      y:      options.y ?? 100,
      width:  options.width,
      height: options.height,
    }, this.ui.theme);

    this.ui.layer.add(win);
    this.windows.set(id, win);
    this.ui.render();
    return id;
  }

  async addButton(windowId: string, label: string, rect: Rect, onClick: () => void): Promise<string> {
    const win = this.windows.get(windowId);
    if (!win) throw new Error(`Window ${windowId} not found`);

    const id = this.generateId();
    const btn = new Button(label, rect, this.ui.theme);
    win.contentArea.add(btn);
    this.widgets.set(id, btn);

    btn.on('click tap', () => {
      onClick();
    });

    this.ui.render();
    return id;
  }

  async addLabel(windowId: string, text: string, rect: Rect): Promise<string> {
    const win = this.windows.get(windowId);
    if (!win) throw new Error(`Window ${windowId} not found`);

    const id = this.generateId();
    const label = new Label(text, rect, this.ui.theme);
    win.contentArea.add(label);
    this.widgets.set(id, label);
    this.ui.render();
    return id;
  }

  async updateWidget(widgetId: string, props: any): Promise<void> {
    const widget = this.widgets.get(widgetId);
    if (!widget) throw new Error(`Widget ${widgetId} not found`);

    if (props.text !== undefined && widget instanceof Label) {
      widget.text(props.text);
    }
    // Handle other widgets as needed

    this.ui.render();
  }
}
