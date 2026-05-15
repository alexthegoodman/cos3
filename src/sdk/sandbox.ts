// ============================================================
// COS3 App SDK — QuickJS Sandbox Bridge
// ============================================================
//
// Each App gets its own QuickJS VM.  Host capabilities are
// injected as synchronous or async host-call functions via
// the quickjs-emscripten "newFunction" API.  The guest script
// calls `COS3.*` and we marshal results back as QuickJS values.
//
// Async host calls use the "interrupt handler + promise pump"
// pattern recommended by quickjs-emscripten.
// ============================================================

import {
  getQuickJS,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
} from "quickjs-emscripten";
import type {
  AppId,
  AppLifecyclePayload,
  AudioPlayOptions,
  BufferDescriptor,
  GamepadEventPayload,
  HostCallResult,
  KeyboardEventPayload,
  LightDescriptor,
  MeshDescriptor,
  MouseEventPayload,
  PipelineConfig,
  TextureDescriptor,
  UINode,
  WindowSize,
} from "./types";
import type { InteropRegistry } from "./registry";
import { generateUUID, EventEmitter } from "./index";
import * as math from "mathjs";

// ---- Host-provided capabilities injected at construction ----

export interface HostGraphicsAPI {
  createBuffer(desc: BufferDescriptor): string;
  updateBuffer(id: string, data: ArrayBufferView): void;
  createTexture(desc: TextureDescriptor): string;
  updateTexture(id: string, data: ArrayBufferView): void;
  createPipeline(cfg: PipelineConfig): string;
  dispatchCompute(pipelineId: string, x: number, y: number, z: number): void;
  createMesh(desc: MeshDescriptor): string;
  createLight(desc: LightDescriptor): string;
}

export interface HostAudioAPI {
  play(opts: AudioPlayOptions): string; // returns playback id
  stop(id: string): void;
  setVolume(id: string, volume: number): void;
}

export interface HostWindowAPI {
  getSize(): WindowSize;
  requestNotification(title: string, body: string): void;
}

export interface HostUIAPI {
  /** Replace the entire UI tree for this app window */
  renderUITree(appId: AppId, node: UINode): void;
}

export interface SandboxHostAPIs {
  graphics: HostGraphicsAPI;
  audio: HostAudioAPI;
  window: HostWindowAPI;
  ui: HostUIAPI;
}

// ---- Events the sandbox emits outward ----

interface SandboxEvents {
  appEvent: { appId: AppId; name: string; payload: unknown };
  lifecycleCallback: AppLifecyclePayload;
  error: { appId: AppId; message: string; stack?: string };
}

// ============================================================
// AppSandbox
// ============================================================

export class AppSandbox extends EventEmitter<SandboxEvents> {
  private runtime!: QuickJSRuntime;
  private vm!: QuickJSContext;
  private appId: AppId;
  private registry: InteropRegistry;
  private host: SandboxHostAPIs;
  private lifecycleHandlers = new Map<string, QuickJSHandle>();
  private eventHandlers = new Map<string, Set<QuickJSHandle>>();
  private disposed = false;

  constructor(
    appId: AppId,
    registry: InteropRegistry,
    host: SandboxHostAPIs
  ) {
    super();
    this.appId = appId;
    this.registry = registry;
    this.host = host;
  }

  /** Must be called before running any script */
  async init(): Promise<void> {
    const QuickJS = await getQuickJS();
    this.runtime = QuickJS.newRuntime();
    // Memory limit: 32 MB per app
    this.runtime.setMemoryLimit(32 * 1024 * 1024);
    // Interrupt after 50 000 instructions (prevents runaway loops)
    this.runtime.setInterruptHandler(() => false);
    this.vm = this.runtime.newContext();
    this._injectHostAPI();
  }

  /** Execute a script string inside the sandbox */
  run(code: string): HostCallResult {
    this._assertAlive();
    const result = this.vm.evalCode(code, `<${this.appId}>`);
    if (result.error) {
      const errStr = this.vm.dump(result.error);
      console.error(errStr)
      result.error.dispose();
      return { ok: false, error: String(JSON.stringify(errStr)) };
    }
    result.value.dispose();
    return { ok: true };
  }

  /** Call a named exported function inside the sandbox */
  callExport(name: string, ...args: unknown[]): HostCallResult {
    this._assertAlive();
    const global = this.vm.global;
    const fn = this.vm.getProp(global, name);
    if (this.vm.typeof(fn) !== "function") {
      fn.dispose();
      return { ok: false, error: `Export "${name}" is not a function` };
    }
    
    const qjsArgs = args.map((a) => {
      if (a && typeof a === 'object' && 'dispose' in a && typeof (a as any).dispose === 'function') {
        return (a as QuickJSHandle).dup();
      }
      return this.vm.newString(JSON.stringify(a));
    });

    const result = this.vm.callFunction(fn, global, ...qjsArgs);
    qjsArgs.forEach((h) => h.dispose());
    fn.dispose();

    if (result.error) {
      const err = this.vm.dump(result.error);
      result.error.dispose();
      return { ok: false, error: String(JSON.stringify(err)) };
    }
    const value = this.vm.dump(result.value);
    result.value.dispose();
    return { ok: true, value };
  }

  /** Deliver a lifecycle event into the sandbox */
  deliverLifecycle(payload: AppLifecyclePayload): void {
    const handler = this.lifecycleHandlers.get(payload.event);
    if (!handler) return;
    const arg = this.vm.newString(JSON.stringify(payload));
    const global = this.vm.global;
    const result = this.vm.callFunction(handler, global, arg);
    arg.dispose();
    if (result.error) {
      result.error.dispose();
    } else {
      result.value.dispose();
    }
  }

  /** Deliver a DOM-style event (keyboard / mouse / gamepad) into the sandbox */
  deliverInputEvent(
    type: "keyboard" | "mouse" | "gamepad",
    payload: KeyboardEventPayload | MouseEventPayload | GamepadEventPayload
  ): void {
    const handlers = this.eventHandlers.get(type);
    if (!handlers) return;
    const arg = this.vm.newString(JSON.stringify(payload));
    const global = this.vm.global;
    for (const h of handlers) {
      const r = this.vm.callFunction(h, global, arg);
      if (r.error) r.error.dispose();
      else r.value.dispose();
    }
    arg.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const h of this.lifecycleHandlers.values()) h.dispose();
    for (const set of this.eventHandlers.values())
      for (const h of set) h.dispose();
    this.vm.dispose();
    this.runtime.dispose();
  }

  // ============================================================
  // Private: host API injection
  // ============================================================

  private _assertAlive(): void {
    if (this.disposed) throw new Error(`[COS3] Sandbox "${this.appId}" disposed`);
  }

  /**
   * Build the `COS3` global inside the QuickJS VM.
   *
   * Each sub-object corresponds to a host API surface.
   * We use vm.newFunction to create synchronous call bridges;
   * arguments and return values are passed as JSON strings to
   * keep the implementation simple and type-safe.
   */
  private _injectHostAPI(): void {
    const vm = this.vm;
    const cos3 = vm.newObject();

    const s = (h: QuickJSHandle) => vm.typeof(h) === 'string' ? vm.getString(h) : '';

    // ---- util ----
    const util = vm.newObject();
    this._addFn(util, "generateUUID", () => vm.newString(generateUUID()));
    this._addFn(util, "now", () => vm.newNumber(Date.now()));
    vm.setProp(cos3, "util", util);
    util.dispose();

    // ---- window ----
    const win = vm.newObject();
    this._addFn(win, "getSize", () => vm.newString(JSON.stringify(this.host.window.getSize())));
    this._addFn(win, "notify", (titleH, bodyH) => {
      this.host.window.requestNotification(s(titleH), s(bodyH));
      return vm.undefined;
    });
    vm.setProp(cos3, "window", win);
    win.dispose();

    // ---- lifecycle ----
    const lc = vm.newObject();
    this._addFn(lc, "on", (eventH, handlerH) => {
      this.lifecycleHandlers.set(s(eventH), handlerH.dup());
      return vm.undefined;
    });
    this._addFn(lc, "emit", (nameH, payloadH) => {
      this.emit("appEvent", { appId: this.appId, name: s(nameH), payload: vm.dump(payloadH) });
      return vm.undefined;
    });
    vm.setProp(cos3, "lifecycle", lc);
    lc.dispose();

    // ---- input ----
    const input = vm.newObject();
    const addInputListener = (_t: any, typeH: QuickJSHandle, handlerH: QuickJSHandle) => {
      const type = s(typeH);
      if (!this.eventHandlers.has(type)) this.eventHandlers.set(type, new Set());
      this.eventHandlers.get(type)!.add(handlerH.dup());
      return vm.undefined;
    };
    vm.newFunction("addEventListener", addInputListener as any).consume(
      (h) => vm.setProp(input, "addEventListener", h)
    );
    vm.setProp(cos3, "input", input);
    input.dispose();

    // ---- graphics ----
    const gfx = vm.newObject();
    this._addFn(gfx, "createBuffer", (descH) => {
      try {
        const desc = vm.dump(descH) as BufferDescriptor;
        if (!desc || typeof desc.size !== 'number') return vm.newString('error:invalid_desc');
        return vm.newString(this.host.graphics.createBuffer(desc));
      } catch (e) {
        console.error('[COS3] createBuffer failed:', e);
        throw e; // re-throw so the VM surfaces it properly
      }
    });
    this._addFn(gfx, "createTexture", (descH) => {
      return vm.newString(this.host.graphics.createTexture(vm.dump(descH)));
    });
    // this._addFn(gfx, "createPipeline", (cfgH) => {
    //   return vm.newString(this.host.graphics.createPipeline(vm.dump(cfgH)));
    // });
    // this._addFn(gfx, "createPipeline", (cfgH) => {
    //   try {
    //     return vm.newString(this.host.graphics.createPipeline(vm.dump(cfgH)));
    //   } catch (e) {
    //     console.error('[COS3] createPipeline failed:', e);
    //     throw e; // re-throw so the VM surfaces it properly
    //   }
    // });
    this._addFn(gfx, "createPipeline", (cfgH) => {
      const cfg = vm.dump(cfgH); // dump synchronously before anything else
      try {
        return vm.newString(this.host.graphics.createPipeline(cfg));
      } catch (e) {
        console.error('[COS3] createPipeline failed:', e);
        throw e;
      }
    });
    this._addFn(gfx, "dispatchCompute", (pidH, xH, yH, zH) => {
      this.host.graphics.dispatchCompute(s(pidH), vm.getNumber(xH), vm.getNumber(yH), vm.getNumber(zH));
      return vm.undefined;
    });
    // this._addFn(gfx, "createMesh", (descH) => {
    //   const desc = vm.dump(descH) as any;
    //   const vertices = Array.isArray(desc.vertices) ? new Float32Array(desc.vertices) : desc.vertices;
    //   const indices = Array.isArray(desc.indices) ? new Uint16Array(desc.indices) : desc.indices;
    //   return vm.newString(this.host.graphics.createMesh({ ...desc, vertices, indices }));
    // });
    this._addFn(gfx, "createMesh", (descH) => {
      try {
        const desc = vm.dump(descH) as any;
        const vertices = Array.isArray(desc.vertices) ? new Float32Array(desc.vertices) : desc.vertices;
        const indices = desc.indices != null
          ? (Array.isArray(desc.indices) ? new Uint16Array(desc.indices) : desc.indices)
          : undefined;
        return vm.newString(this.host.graphics.createMesh({ ...desc, vertices, indices }));
      } catch (e) {
        // return vm.newString(`error:${(e as Error).message}`);
        console.error('[COS3] createMesh failed:', e);
        throw e; // re-throw so the VM surfaces it properly
      }
    });
    this._addFn(gfx, "createLight", (descH) => {
      return vm.newString(this.host.graphics.createLight(vm.dump(descH)));
    });
    vm.setProp(cos3, "graphics", gfx);
    gfx.dispose();

    // ---- audio ----
    const audio = vm.newObject();
    this._addFn(audio, "play", (optsH) => vm.newString(this.host.audio.play(vm.dump(optsH))));
    this._addFn(audio, "stop", (idH) => { this.host.audio.stop(s(idH)); return vm.undefined; });
    this._addFn(audio, "setVolume", (idH, volH) => { this.host.audio.setVolume(s(idH), vm.getNumber(volH)); return vm.undefined; });
    vm.setProp(cos3, "audio", audio);
    audio.dispose();

    // ---- ui ----
    const ui = vm.newObject();
    // this._addFn(ui, "render", (nodeH) => {
    //   this.host.ui.renderUITree(this.appId, vm.dump(nodeH));
    //   return vm.undefined;
    // });
    this._addFn(ui, "render", (nodeH) => {
      const raw = vm.dump(nodeH);
      const node = typeof raw === 'string' ? JSON.parse(raw) : raw;
      this.host.ui.renderUITree(this.appId, node);
      return vm.undefined;
    });
    vm.setProp(cos3, "ui", ui);
    ui.dispose();

    // ---- math ----
    const mathObj = vm.newObject();
    this._addFn(mathObj, "evaluate", (exprH) => {
      try {
        const result = math.evaluate(s(exprH));
        return vm.newString(String(result));
      } catch (e) {
        return vm.newString(`error:${(e as Error).message}`);
      }
    });
    vm.setProp(cos3, "math", mathObj);
    mathObj.dispose();

    // ---- interop ----
    const interop = vm.newObject();
    this._addFn(interop, "listRegistry", () => vm.newString(JSON.stringify(this.registry.toSnapshot())));
    
    // this._addFn(interop, "registerRenderer", (nameH, handlerNameH, backendH) => {
    //   const name = s(nameH);
    //   const handlerName = s(handlerNameH);
    //   const backend = vm.typeof(backendH) === 'string' ? vm.getString(backendH) : 'webgpu';

    //   this.registry.registerRenderer(this.appId, name, backend, async (target, params) => {
    //     const pass = vm.newObject();
    //     const commands: any[] = [];

    //     this._addFn(pass, "setPipeline", (idH) => { commands.push({ type: 'setPipeline', id: s(idH) }); return vm.undefined; });
    //     this._addFn(pass, "setMesh", (idH) => { commands.push({ type: 'setMesh', id: s(idH) }); return vm.undefined; });
    //     this._addFn(pass, "setBuffer", (roleH, idH) => { commands.push({ type: 'setBuffer', role: s(roleH), id: s(idH) }); return vm.undefined; });
    //     this._addFn(pass, "draw", () => { commands.push({ type: 'draw' }); return vm.undefined; });

    //     const result = this.callExport(handlerName, pass, params);
    //     pass.dispose();

    //     return result.ok ? commands : [];
    //   }); 
    //   return vm.undefined;
    // });

    this._addFn(interop, "registerRenderer", (nameH, handlerNameH, backendH) => {
      try {
        const name = s(nameH);
        const handlerName = s(handlerNameH);
        const backend = vm.typeof(backendH) === 'string' ? vm.getString(backendH) : 'webgpu';
        this.registry.registerRenderer(this.appId, name, backend, async (target, params) => {
          const pass = vm.newObject();
          const commands: any[] = [];

          this._addFn(pass, "setPipeline", (idH) => { commands.push({ type: 'setPipeline', id: s(idH) }); return vm.undefined; });
          this._addFn(pass, "setMesh", (idH) => { commands.push({ type: 'setMesh', id: s(idH) }); return vm.undefined; });
          this._addFn(pass, "setBuffer", (roleH, idH) => { commands.push({ type: 'setBuffer', role: s(roleH), id: s(idH) }); return vm.undefined; });
          this._addFn(pass, "draw", () => { commands.push({ type: 'draw' }); return vm.undefined; });

          const result = this.callExport(handlerName, pass, params);
          pass.dispose();

          return result.ok ? commands : [];
        });
      } catch (e) {
        return vm.newString(`error:${(e as Error).message}`);
      }
      return vm.undefined;
    });

    this._addFn(interop, "registerSharedFunction", (nameH) => {
      const name = s(nameH);
      this.registry.registerSharedFunction(this.appId, name, async (...args: any[]) => {
        const result = this.callExport(name, ...args);
        return result.ok ? result.value : Promise.reject(result.error);
      });
      return vm.undefined;
    });

    this._addFn(interop, "callSharedFunction", (appIdH, nameH, argsH) => {
      const targetApp = s(appIdH);
      const fnName = s(nameH);
      const args = vm.dump(argsH) as any[];
      this.registry.callSharedFunction(targetApp, fnName, ...args)
        .then((res) => {
           const code = `typeof __cos3_sfcb_${fnName} === 'function' && __cos3_sfcb_${fnName}(${JSON.stringify(res)})`;
           this.vm.evalCode(code).error?.dispose();
        });
      return vm.undefined;
    });

    vm.setProp(cos3, "interop", interop);
    interop.dispose();

    // Expose as global `COS3`
    vm.setProp(vm.global, "COS3", cos3);
    cos3.dispose();

    // Also expose JSON helpers (QuickJS has a built-in JSON but let's be explicit)
    // and a minimal console
    this._injectConsole();
  }

  private _injectConsole(): void {
    const vm = this.vm;
    const appId = this.appId;
    const console_ = vm.newObject();
    const makeLog =
      (level: "log" | "warn" | "error") =>
      (...args: QuickJSHandle[]) => {
        const msgs = args.map((h) => String(vm.dump(h)));
        const method = console[level] as (...a: string[]) => void;
        method(`[${appId}]`, ...msgs);
        return vm.undefined;
      };
    this._addFn(console_, "log", makeLog("log") as Parameters<typeof this._addFn>[2]);
    this._addFn(console_, "warn", makeLog("warn") as Parameters<typeof this._addFn>[2]);
    this._addFn(console_, "error", makeLog("error") as Parameters<typeof this._addFn>[2]);
    vm.setProp(vm.global, "console", console_);
    console_.dispose();
  }

  /**
   * Helper: create a QuickJS function handle from a JS function,
   * set it as a property, then dispose the handle (vm.setProp keeps a ref).
   */
  private _addFn(
    obj: QuickJSHandle,
    name: string,
    fn: Parameters<QuickJSContext["newFunction"]>[1]
  ): void {
    this.vm.newFunction(name, fn).consume((h) => this.vm.setProp(obj, name, h));
  }
}