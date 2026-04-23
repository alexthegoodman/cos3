// ============================================================
// COS3 App SDK — Utilities
// ============================================================

/**
 * Generate a UUID v4.
 * Uses crypto.getRandomValues when available (browser / Node 19+),
 * falls back to Math.random for QuickJS sandbox contexts.
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: RFC-4122 v4 compliant
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deep-clone a plain JSON-serialisable object.
 * Used when crossing the QuickJS ↔ host boundary.
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Tiny typed event emitter used throughout the SDK.
 */
export class EventEmitter<EventMap extends Record<string, any>> {
  private listeners: {
    [K in keyof EventMap]?: Set<(payload: EventMap[K]) => void>;
  } = {};

  on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void
  ): void {
    this.listeners[event]?.delete(handler);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        console.error(`[COS3] EventEmitter error in handler for "${String(event)}":`, err);
      }
    });
  }

  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

// ============================================================
// COS3 App SDK — Public API
// ============================================================

// Core types
export type {
  AppId,
  AppLifecycleEvent,
  AppLifecyclePayload,
  AppManifest,
  AudioPlayOptions,
  BufferDescriptor,
  DataConstructMeta,
  GamepadEventPayload,
  HostCallResult,
  KeyboardEventPayload,
  LightDescriptor,
  LightType,
  MeshDescriptor,
  MouseEventPayload,
  PipelineBinding,
  PipelineConfig,
  RendererMeta,
  SharedFunctionMeta,
  TextureDescriptor,
  UIComponentMeta,
  UINode,
  UINodeType,
  UUID,
  WindowSize,
} from "./types";

// App Manager (top-level host orchestrator)
export { AppManager } from "./app-manager";
export type { AppManagerOptions } from "./app-manager";

// Sandbox (one per app)
export { AppSandbox } from "./sandbox";
export type {
  HostAudioAPI,
  HostGraphicsAPI,
  HostUIAPI,
  HostWindowAPI,
  SandboxHostAPIs,
} from "./sandbox";

// Interop Registry
export {
  InteropRegistry,
  globalRegistry,
} from "./registry";
export type {
  DataConstructEntry,
  DataConstructLoader,
  DataConstructSaver,
  RendererEntry,
  RenderFunction,
  SharedFn,
  SharedFunctionEntry,
  UIComponentEntry,
  UIComponentFactory,
} from "./registry";

// UI Spec builder
export {
  Button,
  Container,
  Dropdown,
  Image,
  Input,
  Slot,
  Tab,
  Tabs,
  Textarea,
  Text,
  Window,
  GUEST_UI_SCRIPT,
  serializeUITree,
} from "./spec";

// Audio
export { AudioManager } from "./audio";

// Input routing
export { InputRouter } from "./controls";

// Graphics stub (replace with real implementation)
export { GraphicsStub } from "./graphics";