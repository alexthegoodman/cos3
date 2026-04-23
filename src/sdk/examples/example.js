// ============================================================
// COS3 Example App — runs inside the QuickJS sandbox
// ============================================================
//
// This script demonstrates every major SDK surface from the
// guest (app-developer) perspective.
//
// To use: pass the contents of this file to AppManager.launchApp()
// ============================================================

// -------------------------------------------------------------------
// 1. Lifecycle callbacks
// -------------------------------------------------------------------

COS3.lifecycle.on("mount", (payloadJson) => {
  const payload = JSON.parse(payloadJson);
  console.log("App mounted! Window size:", JSON.stringify(payload.windowSize));

  // -------------------------------------------------------------------
  // 2. Build and render the UI tree
  // -------------------------------------------------------------------
  const tree = UI.Window({ title: "My COS3 App", width: 600, height: 400 },
    UI.Container({ layout: "column", padding: 16, gap: 12 },
      UI.Text({ content: "Hello from CommonOS!", size: 24, weight: "bold" }),
      UI.Container({ layout: "row", gap: 8 },
        UI.Input({ placeholder: "Type something…", onChange: "handleInput" }),
        UI.Button("Send", { onClick: "handleSend", variant: "primary" }),
      ),
      UI.Tabs(
        UI.Tab("Overview",
          UI.Text({ content: "This is the overview tab." }),
        ),
        UI.Tab("Settings",
          UI.Dropdown({
            options: [
              { value: "light", label: "Light theme" },
              { value: "dark",  label: "Dark theme" },
            ],
            value: "dark",
            onChange: "handleThemeChange",
          }),
        ),
      ),
    ),
  );
  UI.render(tree);
});

COS3.lifecycle.on("unmount", () => {
  console.log("App unmounting, cleaning up…");
  COS3.audio.stop(bgMusicId);
});

COS3.lifecycle.on("resize", (payloadJson) => {
  const { windowSize } = JSON.parse(payloadJson);
  console.log("Resized:", windowSize.width, "×", windowSize.height);
});

// -------------------------------------------------------------------
// 3. Audio
// -------------------------------------------------------------------

const bgMusicId = COS3.audio.play(JSON.stringify({
  src: "https://example.cos3/assets/ambient.ogg",
  volume: 0.3,
  loop: true,
}));

// -------------------------------------------------------------------
// 4. Input events
// -------------------------------------------------------------------

COS3.input.addEventListener("keyboard", (payloadJson) => {
  const ev = JSON.parse(payloadJson);
  if (ev.type === "keydown" && ev.key === "Escape") {
    console.log("Escape pressed – toggling menu");
  }
});

COS3.input.addEventListener("gamepad", (payloadJson) => {
  const ev = JSON.parse(payloadJson);
  if (ev.type === "buttondown" && ev.buttonIndex === 0) {
    console.log("Gamepad A button pressed");
  }
});

// -------------------------------------------------------------------
// 5. Graphics (WebGPU via host API)
// -------------------------------------------------------------------

const triangleVerts = new Float32Array([
   0.0,  0.5, 0.0,
  -0.5, -0.5, 0.0,
   0.5, -0.5, 0.0,
]);
// NOTE: ArrayBufferView data is not JSON-serialisable; pass it as
// a base64 string and let the host decode it.  For the stub, we
// demonstrate the descriptor pattern without the actual data.
const meshId = COS3.graphics.createMesh(JSON.stringify({
  label: "triangle",
  vertices: Array.from(triangleVerts),
  topology: "triangle-list",
}));

const pipelineId = COS3.graphics.createPipeline(JSON.stringify({
  label: "simple-render",
  vertexShader: `
    @vertex fn vs(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4f {
      var pos = array<vec2f,3>(vec2f(0,.5),vec2f(-.5,-.5),vec2f(.5,-.5));
      return vec4f(pos[idx], 0, 1);
    }
  `,
  fragmentShader: `
    @fragment fn fs() -> @location(0) vec4f { return vec4f(1,0.5,0,1); }
  `,
  bindings: [],
}));

const sunId = COS3.graphics.createLight(JSON.stringify({
  type: "sun",
  color: [1, 0.95, 0.8],
  intensity: 3.0,
  direction: [0.4, -1.0, 0.6],
}));

// -------------------------------------------------------------------
// 6. Interop — call a shared function from another app
// -------------------------------------------------------------------

// Register a callback for the async result
globalThis.__cos3_sfcb_getWeather = (result) => {
  console.log("Weather from weather.cos3:", JSON.stringify(result));
};

COS3.interop.callSharedFunction(
  JSON.stringify("weather.app.cos3"),
  JSON.stringify("getWeather"),
  JSON.stringify([{ city: "San Francisco" }])
);

// -------------------------------------------------------------------
// 7. Utilities
// -------------------------------------------------------------------

const uuid = COS3.util.generateUUID();
console.log("New UUID:", uuid);

const size = JSON.parse(COS3.window.getSize());
console.log("Window:", size.width, size.height, "@", size.devicePixelRatio, "dpr");

// -------------------------------------------------------------------
// 8. Emit a custom event (other apps can subscribe in the future)
// -------------------------------------------------------------------

COS3.lifecycle.emit(
  JSON.stringify("userAction"),
  JSON.stringify({ action: "appReady", meshId, pipelineId })
);

console.log("Example app script finished bootstrapping.");