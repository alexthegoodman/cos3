import { AppRuntime } from './runtime';
import { AppManifest } from './api';

export class Registry {
  private static instance: Registry;
  private apps: Map<string, AppManifest> = new Map();
  private runtimes: Map<string, AppRuntime> = new Map();

  private constructor() {}

  static getInstance(): Registry {
    if (!Registry.instance) {
      Registry.instance = new Registry();
    }
    return Registry.instance;
  }

  registerApp(manifest: AppManifest, code: string, runtime: AppRuntime) {
    this.apps.set(manifest.id, manifest);
    this.runtimes.set(manifest.id, runtime);
  }

  getApp(id: string) {
    return this.apps.get(id);
  }

  getRuntime(id: string) {
    return this.runtimes.get(id);
  }

  listApps() {
    return Array.from(this.apps.values());
  }
}
