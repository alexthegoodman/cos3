// ============================================================
// COS3 App SDK — Host Integration Example
// ============================================================
//
// This file shows how the COS3 host application (outside the
// SDK) wires everything together.  In your real host you would
// replace the stubs below with your Konva / WebGPU layer.
// ============================================================

import {
  AppManager,
  AudioManager,
  GraphicsStub,
  InputRouter,
  globalRegistry,
  GUEST_UI_SCRIPT,
} from "../index";
import type { SandboxHostAPIs } from "../index";
import { readFileSync } from "fs";

// ---- 1. Build the host API bundle ----

const audioManager = new AudioManager();
const graphicsStub = new GraphicsStub();

const hostAPIs: SandboxHostAPIs = {
  graphics: graphicsStub,
  audio: audioManager,
  window: {
    getSize: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }),
    requestNotification: (title, body) => {
      // TODO: route to COS3 notification system
      console.info("[COS3 Notification]", title, body);
    },
  },
  ui: {
    renderUITree: (appId, node) => {
      // TODO: pass to Konva renderer
      console.info("[COS3 UI]", appId, JSON.stringify(node, null, 2));
    },
  },
};

// ---- 2. Boot the App Manager ----

const manager = new AppManager({ registry: globalRegistry, host: hostAPIs });
const inputRouter = new InputRouter(manager);

manager.on("appRegistered", ({ manifest }) => {
  console.info("[COS3] App registered:", manifest.id);
});
manager.on("appLaunched", ({ appId }) => {
  console.info("[COS3] App launched:", appId);
  inputRouter.setFocus(appId); // auto-focus first launched app
});
manager.on("appError", ({ appId, message }) => {
  console.error("[COS3] App error:", appId, message);
});

// ---- 3. Register interop from host / built-in apps ----

globalRegistry.registerSharedFunction(
  "weather.app.cos3",
  "getWeather",
  async (args: any) => {
    const { city } = args as { city: string };
    // TODO: real weather fetch
    return { city, temp: 18, condition: "Partly cloudy" };
  }
);

// ---- 4. Launch an example app ----

const exampleAppCode = readFileSync("./example-app.js", "utf8");

manager.registerApp({
  id: "alice.example.cos3",
  name: "Example App",
  version: "1.0.0",
  description: "COS3 SDK demo app",
});

// Prepend the guest UI helpers so app scripts can use UI.*
await manager.launchApp(
  "alice.example.cos3",
  GUEST_UI_SCRIPT + "\n" + exampleAppCode
);

// ---- 5. Attach input routing ----

inputRouter.attach(window);

// ---- 6. Cleanup on unload ----

window.addEventListener("beforeunload", () => {
  inputRouter.detach(window);
  manager.dispose();
  audioManager.stopAll();
});