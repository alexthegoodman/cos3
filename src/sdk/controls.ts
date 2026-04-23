// ============================================================
// COS3 App SDK — Input Event Router (Host-side)
// ============================================================

import type {
  GamepadEventPayload,
  KeyboardEventPayload,
  MouseEventPayload,
} from "./types";
import type { AppManager } from "./app-manager";

export class InputRouter {
  private manager: AppManager;
  private focusedApp: string | null = null;
  private gamepadPollHandle: number | null = null;
  private prevButtons: Map<number, boolean[]> = new Map();

  constructor(manager: AppManager) {
    this.manager = manager;
  }

  /** Call once to attach window-level listeners */
  attach(target: Window | HTMLElement = window): void {
    target.addEventListener("keydown", this._onKey as EventListener);
    target.addEventListener("keyup", this._onKey as EventListener);
    target.addEventListener("mousemove", this._onMouse as EventListener);
    target.addEventListener("mousedown", this._onMouse as EventListener);
    target.addEventListener("mouseup", this._onMouse as EventListener);
    target.addEventListener("click", this._onMouse as EventListener);
    target.addEventListener("wheel", this._onMouse as EventListener);
    window.addEventListener("gamepadconnected", this._onGamepadConnect);
    window.addEventListener("gamepaddisconnected", this._onGamepadDisconnect);
    this.gamepadPollHandle = window.setInterval(this._pollGamepads, 16);
  }

  detach(target: Window | HTMLElement = window): void {
    target.removeEventListener("keydown", this._onKey as EventListener);
    target.removeEventListener("keyup", this._onKey as EventListener);
    target.removeEventListener("mousemove", this._onMouse as EventListener);
    target.removeEventListener("mousedown", this._onMouse as EventListener);
    target.removeEventListener("mouseup", this._onMouse as EventListener);
    target.removeEventListener("click", this._onMouse as EventListener);
    target.removeEventListener("wheel", this._onMouse as EventListener);
    window.removeEventListener("gamepadconnected", this._onGamepadConnect);
    window.removeEventListener("gamepaddisconnected", this._onGamepadDisconnect);
    if (this.gamepadPollHandle !== null) {
      clearInterval(this.gamepadPollHandle);
      this.gamepadPollHandle = null;
    }
  }

  setFocus(appId: string | null): void {
    this.focusedApp = appId;
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (!this.focusedApp) return;
    const payload: KeyboardEventPayload = {
      type: e.type as KeyboardEventPayload["type"],
      key: e.key,
      code: e.code,
      modifiers: {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      },
    };
    this.manager.deliverKeyboardEvent(this.focusedApp, payload);
  };

  private _onMouse = (e: MouseEvent | WheelEvent): void => {
    if (!this.focusedApp) return;
    const payload: MouseEventPayload = {
      type: e.type as MouseEventPayload["type"],
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      ...(e instanceof WheelEvent
        ? { deltaX: e.deltaX, deltaY: e.deltaY }
        : {}),
    };
    this.manager.deliverMouseEvent(this.focusedApp, payload);
  };

  private _onGamepadConnect = (e: GamepadEvent): void => {
    const payload: GamepadEventPayload = {
      type: "connected",
      gamepadIndex: e.gamepad.index,
    };
    // Broadcast to all apps
    for (const appId of this.manager.getRunningApps()) {
      this.manager.deliverGamepadEvent(appId, payload);
    }
  };

  private _onGamepadDisconnect = (e: GamepadEvent): void => {
    const payload: GamepadEventPayload = {
      type: "disconnected",
      gamepadIndex: e.gamepad.index,
    };
    for (const appId of this.manager.getRunningApps()) {
      this.manager.deliverGamepadEvent(appId, payload);
    }
  };

  private _pollGamepads = (): void => {
    if (!this.focusedApp) return;
    const gamepads = navigator.getGamepads?.() ?? [];
    for (const gp of gamepads) {
      if (!gp) continue;
      const prev = this.prevButtons.get(gp.index) ?? [];
      gp.buttons.forEach((btn, i) => {
        const wasPressed = prev[i] ?? false;
        if (btn.pressed !== wasPressed) {
          const payload: GamepadEventPayload = {
            type: btn.pressed ? "buttondown" : "buttonup",
            gamepadIndex: gp.index,
            buttonIndex: i,
            value: btn.value,
          };
          this.manager.deliverGamepadEvent(this.focusedApp!, payload);
        }
      });
      gp.axes.forEach((value, i) => {
        const payload: GamepadEventPayload = {
          type: "axis",
          gamepadIndex: gp.index,
          axisIndex: i,
          value,
        };
        this.manager.deliverGamepadEvent(this.focusedApp!, payload);
      });
      this.prevButtons.set(
        gp.index,
        gp.buttons.map((b) => b.pressed)
      );
    }
  };
}