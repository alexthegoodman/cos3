// ============================================================
// COS3 App SDK — Interop Registry
// ============================================================
//
// All registered items are keyed by (appId, name) so any app
// can resolve something from any other app.  The registry lives
// in host-space and is exposed to QuickJS via the host-call bridge.
// ============================================================

import type {
  AppId,
  DataConstructMeta,
  RendererMeta,
  SharedFunctionMeta,
  UIComponentMeta,
} from "./types";

// ------ Typed registry containers ------

type RegistryKey = `${AppId}::${string}`;

function makeKey(appId: AppId, name: string): RegistryKey {
  return `${appId}::${name}`;
}

// ------ Data Constructs ------

export type DataConstructLoader<T = unknown> = () => Promise<T>;
export type DataConstructSaver<T = unknown> = (data: T) => Promise<void>;

export interface DataConstructEntry<T = unknown> {
  meta: DataConstructMeta;
  load: DataConstructLoader<T>;
  save: DataConstructSaver<T>;
}

// ------ Renderers ------

export type RenderFunction = (
  ctx: GPURenderPassEncoder | CanvasRenderingContext2D,
  params: Record<string, unknown>
) => void;

export interface RendererEntry {
  meta: RendererMeta;
  render: RenderFunction;
}

// ------ UI Components ------

export type UIComponentFactory = (
  props: Record<string, unknown>
) => unknown; // returns a UINode or host-specific handle

export interface UIComponentEntry {
  meta: UIComponentMeta;
  factory: UIComponentFactory;
}

// ------ Shared Functions ------

export type SharedFn = (...args: unknown[]) => unknown | Promise<unknown>;

export interface SharedFunctionEntry {
  meta: SharedFunctionMeta;
  fn: SharedFn;
}

// ============================================================
// Registry class
// ============================================================

export class InteropRegistry {
  private dataConstructs = new Map<RegistryKey, DataConstructEntry>();
  private renderers = new Map<RegistryKey, RendererEntry>();
  private uiComponents = new Map<RegistryKey, UIComponentEntry>();
  private sharedFunctions = new Map<RegistryKey, SharedFunctionEntry>();

  // ----- Data Constructs -----

  registerDataConstruct<T>(
    appId: AppId,
    name: string,
    load: DataConstructLoader<T>,
    save: DataConstructSaver<T>,
    schema?: Record<string, unknown>
  ): void {
    const key = makeKey(appId, name);
    if (this.dataConstructs.has(key)) {
      console.warn(`[COS3] DataConstruct already registered: ${key}`);
    }
    this.dataConstructs.set(key, {
      meta: { appId, name, schema },
      load: load as DataConstructLoader,
      save: save as DataConstructSaver,
    });
  }

  getDataConstruct<T = unknown>(
    appId: AppId,
    name: string
  ): DataConstructEntry<T> | undefined {
    return this.dataConstructs.get(makeKey(appId, name)) as
      | DataConstructEntry<T>
      | undefined;
  }

  listDataConstructs(appId?: AppId): DataConstructMeta[] {
    const entries = [...this.dataConstructs.values()];
    return (appId ? entries.filter((e) => e.meta.appId === appId) : entries).map(
      (e) => e.meta
    );
  }

  // ----- Renderers -----

  registerRenderer(
    appId: AppId,
    name: string,
    backend: string,
    render: RenderFunction
  ): void {
    const key = makeKey(appId, name);
    this.renderers.set(key, {
      meta: { appId, name, backend },
      render,
    });
  }

  getRenderer(appId: AppId, name: string): RendererEntry | undefined {
    return this.renderers.get(makeKey(appId, name));
  }

  listRenderers(appId?: AppId): RendererMeta[] {
    const entries = [...this.renderers.values()];
    return (appId ? entries.filter((e) => e.meta.appId === appId) : entries).map(
      (e) => e.meta
    );
  }

  // ----- UI Components -----

  registerUIComponent(
    appId: AppId,
    name: string,
    factory: UIComponentFactory
  ): void {
    const key = makeKey(appId, name);
    this.uiComponents.set(key, {
      meta: { appId, name },
      factory,
    });
  }

  getUIComponent(appId: AppId, name: string): UIComponentEntry | undefined {
    return this.uiComponents.get(makeKey(appId, name));
  }

  listUIComponents(appId?: AppId): UIComponentMeta[] {
    const entries = [...this.uiComponents.values()];
    return (appId ? entries.filter((e) => e.meta.appId === appId) : entries).map(
      (e) => e.meta
    );
  }

  // ----- Shared Functions -----

  registerSharedFunction(appId: AppId, name: string, fn: SharedFn): void {
    const key = makeKey(appId, name);
    this.sharedFunctions.set(key, {
      meta: { appId, name },
      fn,
    });
  }

  getSharedFunction(appId: AppId, name: string): SharedFunctionEntry | undefined {
    return this.sharedFunctions.get(makeKey(appId, name));
  }

  async callSharedFunction(
    appId: AppId,
    name: string,
    ...args: unknown[]
  ): Promise<unknown> {
    const entry = this.getSharedFunction(appId, name);
    if (!entry) {
      throw new Error(`[COS3] SharedFunction not found: ${appId}::${name}`);
    }
    return entry.fn(...args);
  }

  listSharedFunctions(appId?: AppId): SharedFunctionMeta[] {
    const entries = [...this.sharedFunctions.values()];
    return (appId ? entries.filter((e) => e.meta.appId === appId) : entries).map(
      (e) => e.meta
    );
  }

  // ----- Serialisable snapshot (for QuickJS exposure) -----

  toSnapshot(): {
    dataConstructs: DataConstructMeta[];
    renderers: RendererMeta[];
    uiComponents: UIComponentMeta[];
    sharedFunctions: SharedFunctionMeta[];
  } {
    return {
      dataConstructs: this.listDataConstructs(),
      renderers: this.listRenderers(),
      uiComponents: this.listUIComponents(),
      sharedFunctions: this.listSharedFunctions(),
    };
  }
}

/** Singleton shared across the host process */
export const globalRegistry = new InteropRegistry();