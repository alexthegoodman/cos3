import { Rect, Color } from '../velui/types';

export interface AppManifest {
  id: string; // e.g. "username.appname.com"
  name: string;
  version: string;
  description?: string;
  icon?: string;
}

export interface WindowOptions {
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface AppContext {
  id: string;
  createWindow(options: WindowOptions): Promise<string>; // returns windowId
  // UI Components
  addButton(windowId: string, label: string, rect: Rect): Promise<string>;
  addLabel(windowId: string, text: string, rect: Rect): Promise<string>;
  // GPU
  createPipeline(config: any): Promise<string>;
  createBuffer(config: any): Promise<string>;
  // Data
  saveData(key: string, data: any): Promise<void>;
  loadData(key: string): Promise<any>;
}
