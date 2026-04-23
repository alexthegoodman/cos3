// ============================================================
// COS3 App SDK — App Manager
// ============================================================
//
// The AppManager is the top-level host-side object.
// It:
//   • Validates and stores AppManifests
//   • Creates / destroys AppSandbox instances
//   • Routes lifecycle events and input events to the right sandbox
//   • Exposes the InteropRegistry
// ============================================================

import type { AppId, AppLifecycleEvent, AppManifest } from "./types";
import { AppSandbox, type SandboxHostAPIs } from "./sandbox";
import { InteropRegistry, globalRegistry } from "./registry";
import { EventEmitter } from "./index";

export interface AppManagerOptions {
  /** Provide your own registry, or the global singleton is used */
  registry?: InteropRegistry;
  host: SandboxHostAPIs;
}

interface AppManagerEvents {
  appRegistered: { manifest: AppManifest };
  appLaunched: { appId: AppId };
  appTerminated: { appId: AppId };
  appError: { appId: AppId; message: string };
}

export class AppManager extends EventEmitter<AppManagerEvents> {
  private manifests = new Map<AppId, AppManifest>();
  private sandboxes = new Map<AppId, AppSandbox>();
  readonly registry: InteropRegistry;
  private host: SandboxHostAPIs;

  constructor(options: AppManagerOptions) {
    super();
    this.registry = options.registry ?? globalRegistry;
    this.host = options.host;
  }

  // ---- Registration ----

  registerApp(manifest: AppManifest): void {
    if (this.manifests.has(manifest.id)) {
      console.warn(`[COS3] App already registered: ${manifest.id}`);
    }
    this.manifests.set(manifest.id, manifest);
    this.emit("appRegistered", { manifest });
  }

  getManifest(appId: AppId): AppManifest | undefined {
    return this.manifests.get(appId);
  }

  listApps(): AppManifest[] {
    return [...this.manifests.values()];
  }

  // ---- Sandbox lifecycle ----

  async launchApp(appId: AppId, code: string): Promise<void> {
    if (!this.manifests.has(appId)) {
      throw new Error(`[COS3] App not registered: ${appId}`);
    }
    if (this.sandboxes.has(appId)) {
      console.warn(`[COS3] App already running: ${appId}`);
      return;
    }
    const sandbox = new AppSandbox(appId, this.registry, this.host);
    sandbox.on("error", ({ message }) => {
      this.emit("appError", { appId, message });
    });
    sandbox.on("appEvent", (payload) => {
      // Fan out to other sandboxes that subscribed
      this._routeAppEvent(payload.appId, payload.name, payload.payload);
    });

    await sandbox.init();
    this.sandboxes.set(appId, sandbox);

    const result = sandbox.run(code);
    if (!result.ok) {
      sandbox.dispose();
      this.sandboxes.delete(appId);
      throw new Error(`[COS3] App "${appId}" failed on launch: ${result.error}`);
    }

    // Deliver mount event
    sandbox.deliverLifecycle({
      event: "mount",
      appId,
      timestamp: Date.now(),
      windowSize: this.host.window.getSize(),
    });

    this.emit("appLaunched", { appId });
  }

  terminateApp(appId: AppId): void {
    const sandbox = this.sandboxes.get(appId);
    if (!sandbox) return;

    sandbox.deliverLifecycle({
      event: "unmount",
      appId,
      timestamp: Date.now(),
    });

    sandbox.dispose();
    this.sandboxes.delete(appId);
    this.emit("appTerminated", { appId });
  }

  isRunning(appId: AppId): boolean {
    return this.sandboxes.has(appId);
  }

  getRunningApps(): AppId[] {
    return [...this.sandboxes.keys()];
  }

  // ---- Event routing ----

  deliverLifecycleTo(
    appId: AppId,
    event: AppLifecycleEvent,
    extra?: Partial<{ windowSize: ReturnType<SandboxHostAPIs["window"]["getSize"]> }>
  ): void {
    const sandbox = this.sandboxes.get(appId);
    if (!sandbox) return;
    sandbox.deliverLifecycle({
      event,
      appId,
      timestamp: Date.now(),
      ...extra,
    });
  }

  /** Broadcast a lifecycle event to every running app */
  broadcastLifecycle(event: AppLifecycleEvent): void {
    for (const appId of this.sandboxes.keys()) {
      this.deliverLifecycleTo(appId, event);
    }
  }

  deliverKeyboardEvent(
    appId: AppId,
    payload: Parameters<AppSandbox["deliverInputEvent"]>[1] & { type: "keydown" | "keyup" | "keypress" }
  ): void {
    this.sandboxes.get(appId)?.deliverInputEvent("keyboard", payload);
  }

  deliverMouseEvent(
    appId: AppId,
    payload: Parameters<AppSandbox["deliverInputEvent"]>[1] & { type: string }
  ): void {
    this.sandboxes.get(appId)?.deliverInputEvent("mouse", payload as Parameters<AppSandbox["deliverInputEvent"]>[1]);
  }

  deliverGamepadEvent(
    appId: AppId,
    payload: Parameters<AppSandbox["deliverInputEvent"]>[1] & { type: string }
  ): void {
    this.sandboxes.get(appId)?.deliverInputEvent("gamepad", payload as Parameters<AppSandbox["deliverInputEvent"]>[1]);
  }

  // ---- Internal helpers ----

  private _routeAppEvent(
    _sourceAppId: AppId,
    _name: string,
    _payload: unknown
  ): void {
    // Future: implement pub/sub subscription table so apps can
    // subscribe to events from specific apps.
  }

  /** Clean up everything */
  dispose(): void {
    for (const appId of [...this.sandboxes.keys()]) {
      this.terminateApp(appId);
    }
  }
}