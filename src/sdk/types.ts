// ============================================================
// COS3 App SDK — Core Types
// ============================================================

/** Fully-qualified app identifier: "username.appname.com" */
export type AppId = string;

/** Unique opaque identifier */
export type UUID = string;

// ------ App Registration ------

export interface AppManifest {
  /** Globally unique id, e.g. "alice.notepad.cos3" */
  id: AppId;
  /** Human-readable display name */
  name: string;
  version: string;
  description?: string;
  /** Optional icon (data-URI or URL) */
  icon?: string;
}

// ------ Lifecycle Events ------

export type AppLifecycleEvent =
  | "mount"
  | "unmount"
  | "focus"
  | "blur"
  | "resize"
  | "suspend"
  | "resume";

export interface AppLifecyclePayload {
  event: AppLifecycleEvent;
  appId: AppId;
  timestamp: number;
  windowSize?: WindowSize;
}

// ------ Interop Registry Entries ------

export interface DataConstructMeta {
  appId: AppId;
  name: string;
  schema?: Record<string, unknown>; // JSON Schema-ish
}

export interface RendererMeta {
  appId: AppId;
  name: string;
  /** "webgpu" | "canvas2d" | "svg" */
  backend: string;
}

export interface UIComponentMeta {
  appId: AppId;
  name: string;
}

export interface SharedFunctionMeta {
  appId: AppId;
  name: string;
}

// ------ Graphics ------

export interface BufferDescriptor {
  label?: string;
  size: number;
  usage: GPUBufferUsageFlags;
  data?: ArrayBufferView;
}

export interface TextureDescriptor {
  label?: string;
  width: number;
  height: number;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  data?: ArrayBufferView;
}

export interface PipelineConfig {
  label?: string;
  /** WGSL source */
  computeShader?: string;
  vertexShader?: string;
  fragmentShader?: string;
  /** Simplified bind-group entries — SDK auto-builds layouts */
  bindings: PipelineBinding[];
}

export interface PipelineBinding {
  group: number;
  binding: number;
  type: "uniform" | "storage" | "read-only-storage" | "texture" | "sampler";
  resource: string; // logical name, resolved at dispatch time
}

export interface MeshDescriptor {
  label?: string;
  vertices: Float32Array;
  indices?: Uint16Array | Uint32Array;
  topology?: GPUPrimitiveTopology;
}

export type LightType = "point" | "sun";

export interface LightDescriptor {
  type: LightType;
  color: [number, number, number]; // linear RGB
  intensity: number;
  position?: [number, number, number]; // point light
  direction?: [number, number, number]; // sun
}

// ------ Window / UI ------

export interface WindowSize {
  width: number;
  height: number;
  devicePixelRatio: number;
}

// ------ Events ------

export interface KeyboardEventPayload {
  type: "keydown" | "keyup" | "keypress";
  key: string;
  code: string;
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
}

export interface MouseEventPayload {
  type:
    | "mousedown"
    | "mouseup"
    | "mousemove"
    | "click"
    | "dblclick"
    | "wheel";
  x: number;
  y: number;
  button: number;
  deltaX?: number;
  deltaY?: number;
}

export interface GamepadEventPayload {
  type: "connected" | "disconnected" | "buttondown" | "buttonup" | "axis";
  gamepadIndex: number;
  buttonIndex?: number;
  axisIndex?: number;
  value?: number;
}

// ------ Audio ------

export interface AudioPlayOptions {
  /** URL or data-URI */
  src: string;
  volume?: number;
  loop?: boolean;
  /** Seconds from start */
  startAt?: number;
}

// ------ UI Spec (JSX-like declarative tree) ------

export type UINodeType =
  | "window"
  | "container"
  | "text"
  | "input"
  | "textarea"
  | "image"
  | "tabs"
  | "tab"
  | "dropdown"
  | "button"
  | "slot"; // named injection point

export interface UINode {
  type: UINodeType;
  id?: string;
  props?: Record<string, unknown>;
  children?: UINode[];
  /** Event handler name (resolved to a registered function) */
  on?: Record<string, string>;
}

// ------ QuickJS Host Call Tables ------

export interface HostCallResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
}