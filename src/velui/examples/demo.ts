/**
 * velui demo — CommonOS compositor prototype
 *
 * Demonstrates:
 *  1. Multiple floating windows with spring animations
 *  2. All core widgets (button, label, tabs, dropdown, text input, number input)
 *  3. A WebGPU texture window: a 3D spinning cube rendered by a separate pass
 *     and composited seamlessly into the UI window frame
 *  4. A mediabunny-style video window (OffscreenCanvas → texture upload)
 *  5. Minimised window bar
 */

import {
  Ui, Id,
  button, label, tabs, dropdown, textInput, numberInput, textarea, container,
  windowBegin, windowEnd, miniBar,
  ColorUtils as C, RectUtils as R,
  HCursor, LayoutCursor,
} from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// App state (immediate-mode — no framework)
// ─────────────────────────────────────────────────────────────────────────────

let ui: Ui;
const canvas = document.querySelector<HTMLCanvasElement>('#app')!;

const appState = {
  name:        { current: '' },
  description: { current: '' },
  counter:     { current: 0 },
  tabIndex:    0,
  dropdownSel: 0,
  themeLight:  false,
};

// WebGPU texture windows
let sceneTexture: GPUTexture | null = null;  // 3D cube scene
let videoTexture: GPUTexture | null = null;  // mediabunny video

// IDs are stable objects — create them once
const IDs = {
  winControls: new Id('win-controls'),
  winScene:    new Id('win-scene'),
  winVideo:    new Id('win-video'),
  winAudio:    new Id('win-audio'),
  tabs:        new Id('main-tabs'),
  dropdown:    new Id('mode-dropdown'),
  inputName:   new Id('input-name'),
  inputNum:    new Id('input-num'),
  inputDesc:   new Id('input-desc'),
  btnDec:      new Id('btn-dec'),
  btnInc:      new Id('btn-inc'),
  btnReset:    new Id('btn-reset'),
  btnTheme:    new Id('btn-theme'),
};

// ─────────────────────────────────────────────────────────────────────────────
// 3D scene renderer (separate first-party app, shares same GPUDevice)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal spinning-cube renderer that outputs to a GPUTexture. */
class CubeScene {
  private pipeline!: GPURenderPipeline;
  private vertexBuf!: GPUBuffer;
  private uniformBuf!: GPUBuffer;
  private depthTex!:   GPUTexture;
  private bindGroup!:  GPUBindGroup;
  private ready = false;

  async init(device: GPUDevice, format: GPUTextureFormat) {
    const shader = /* wgsl */`
      struct Uni { mvp: mat4x4f }
      @group(0) @binding(0) var<uniform> uni: Uni;

      struct VsOut {
        @builtin(position) pos: vec4f,
        @location(0) col: vec3f,
      }

      const verts = array<vec3f, 36>(
        // front  (z=+1)  red
        vec3f(-1,-1, 1), vec3f( 1,-1, 1), vec3f( 1, 1, 1),
        vec3f(-1,-1, 1), vec3f( 1, 1, 1), vec3f(-1, 1, 1),
        // back   (z=-1)  green
        vec3f( 1,-1,-1), vec3f(-1,-1,-1), vec3f(-1, 1,-1),
        vec3f( 1,-1,-1), vec3f(-1, 1,-1), vec3f( 1, 1,-1),
        // left   (x=-1)  blue
        vec3f(-1,-1,-1), vec3f(-1,-1, 1), vec3f(-1, 1, 1),
        vec3f(-1,-1,-1), vec3f(-1, 1, 1), vec3f(-1, 1,-1),
        // right  (x=+1)  yellow
        vec3f( 1,-1, 1), vec3f( 1,-1,-1), vec3f( 1, 1,-1),
        vec3f( 1,-1, 1), vec3f( 1, 1,-1), vec3f( 1, 1, 1),
        // top    (y=+1)  cyan
        vec3f(-1, 1, 1), vec3f( 1, 1, 1), vec3f( 1, 1,-1),
        vec3f(-1, 1, 1), vec3f( 1, 1,-1), vec3f(-1, 1,-1),
        // bottom (y=-1)  magenta
        vec3f( 1,-1, 1), vec3f(-1,-1, 1), vec3f(-1,-1,-1),
        vec3f( 1,-1, 1), vec3f(-1,-1,-1), vec3f( 1,-1,-1),
      );
      const cols = array<vec3f, 6>(
        vec3f(0.9,0.3,0.3), vec3f(0.3,0.9,0.3), vec3f(0.3,0.4,0.9),
        vec3f(0.9,0.9,0.3), vec3f(0.3,0.9,0.9), vec3f(0.9,0.3,0.9),
      );

      @vertex fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
        let face = vi / 6u;
        return VsOut(uni.mvp * vec4f(verts[vi], 1.0), cols[face]);
      }
      @fragment fn fs(in: VsOut) -> @location(0) vec4f {
        return vec4f(in.col, 1.0);
      }
    `;

    const mod = device.createShaderModule({ code: shader });
    const bgl = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX,
                  buffer: { type: 'uniform' } }],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex:   { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs',
                  targets: [{ format }] },
      depthStencil: { format: 'depth24plus',
                      depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
    });

    this.uniformBuf = device.createBuffer({
      size:  64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }],
    });
    this.ready = true;
  }

  ensureDepth(device: GPUDevice, w: number, h: number) {
    if (this.depthTex?.width === w && this.depthTex?.height === h) return;
    this.depthTex?.destroy();
    this.depthTex = device.createTexture({
      size: [w, h], format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  renderTo(device: GPUDevice, queue: GPUQueue, target: GPUTexture, t: number) {
    if (!this.ready) return;
    const { width: w, height: h } = target;
    this.ensureDepth(device, w, h);

    // Build MVP: perspective * view * rotate
    const aspect = w / h;
    const mvp    = buildMVP(t, aspect);
    queue.writeBuffer(this.uniformBuf, 0, mvp.buffer);

    const enc  = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view:       target.createView(),
        loadOp:     'clear',
        storeOp:    'store',
        clearValue: { r: 0.07, g: 0.07, b: 0.1, a: 1 },
      }],
      depthStencilAttachment: {
        view:              this.depthTex.createView(),
        depthLoadOp:       'clear',
        depthStoreOp:      'store',
        depthClearValue:   1,
      },
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(36);
    pass.end();
    queue.submit([enc.finish()]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export default async function main() {
  canvas.width  = window.innerWidth  * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width  = '100vw';
  canvas.style.height = '100vh';

  ui = await Ui.init(canvas, undefined);

  const cube = new CubeScene();
  await cube.init(ui.gpu.device, ui.gpu.format);

  // Allocate the scene texture (for the 3D cube window)
  sceneTexture = ui.gpu.createWindowTexture(400, 300, 'cube-scene');

  let needsRepaint = true;
  let lastTime = performance.now();

  function frame() {
    const now   = performance.now();
    const t     = now / 1000;
    const input = ui.collector.collect();

    // ── Render 3D scene into its texture ─────────────────────────────────
    cube.renderTo(ui.gpu.device, ui.gpu.device.queue, sceneTexture!, t);

    // ── UI frame ──────────────────────────────────────────────────────────
    const vpW = canvas.width  / devicePixelRatio;
    const vpH = canvas.height / devicePixelRatio;

    const p = ui.beginFrame(input, canvas.width, canvas.height);

    // Background
    p.fillRect({ x: 0, y: 0, w: vpW, h: vpH }, ui.theme.bg);

    const theme = ui.theme;

    // ── Controls window ───────────────────────────────────────────────────
    const ctrlWin = windowBegin(
      IDs.winControls,
      { title: 'Controls', defaultRect: R.make(40, 40, 320, 500) },
      p, ui.state, input, theme,
    );
    if (ctrlWin.visible) {
      const cur = ctrlWin.cursor;

      // Tabs
      const tabRect = cur.next(32);
      appState.tabIndex = tabs(IDs.tabs, ['Widgets', 'Counter', 'About'],
                               tabRect, p, ui.state, input, theme);

      if (appState.tabIndex === 0) {
        // Name input
        label('Name', cur.next(18), p, theme, theme.textDim, theme.fontSizeSmall);
        textInput(IDs.inputName, appState.name, cur.next(34), p, ui.state, input, theme,
                  'Your name…');

        // Dropdown
        label('Mode', cur.next(18), p, theme, theme.textDim, theme.fontSizeSmall);
        appState.dropdownSel = dropdown(
          IDs.dropdown, ['Alpha', 'Beta', 'Gamma', 'Delta'],
          appState.dropdownSel, cur.next(34), p, ui.state, input, theme,
        );

        // Textarea
        label('Notes', cur.next(18), p, theme, theme.textDim, theme.fontSizeSmall);
        textarea(IDs.inputDesc, appState.description, cur.next(80),
                 p, ui.state, input, theme);

        // Theme toggle
        const themeRect = cur.next(36);
        if (button(IDs.btnTheme, '⬤ Toggle Theme', themeRect, p, ui.state, input, theme).clicked) {
          appState.themeLight = !appState.themeLight;
          ui.theme = appState.themeLight
            ? { ...theme, bg: C.hex(0xf2f2f6), surface: C.hex(0xffffff),
                surfaceRaised: C.hex(0xe9e9f0), border: C.hex(0xc8c8d4),
                text: C.hex(0x17171f), textDim: C.hex(0x64647a),
                accent: C.hex(0x2e68e8), accentHover: C.hex(0x1854d0),
                accentPress: C.hex(0x0d40b8) }
            : theme;
        }
      }

      if (appState.tabIndex === 1) {
        // Counter
        label(`Count: ${appState.counter.current}`, cur.next(28),
              p, theme, theme.text, theme.fontSize);

        const hc = new HCursor(cur.innerX, cur.y, 36, theme.gap);
        cur.y += 36 + theme.gap;
        if (button(IDs.btnDec, '−', hc.next(80), p, ui.state, input, theme).clicked)
          appState.counter.current = Math.max(0, appState.counter.current - 1);
        if (button(IDs.btnInc, '+', hc.next(80), p, ui.state, input, theme).clicked)
          appState.counter.current++;
        if (button(IDs.btnReset, 'Reset', hc.next(80), p, ui.state, input, theme).clicked)
          appState.counter.current = 0;
      }

      if (appState.tabIndex === 2) {
        label('velui — WebGPU compositor', cur.next(22), p, theme);
        label('All UI rendered natively on GPU.', cur.next(20), p, theme,
              theme.textDim, theme.fontSizeSmall);
        label('Window textures are zero-copy.', cur.next(20), p, theme,
              theme.textDim, theme.fontSizeSmall);
      }

      windowEnd(ctrlWin);
    }

    // ── 3D Scene window ───────────────────────────────────────────────────
    // sceneTexture is rendered above; we hand it to the window for compositing.
    const sceneWin = windowBegin(
      IDs.winScene,
      {
        title:          'WebGPU Scene',
        defaultRect:    R.make(400, 40, 440, 360),
        contentTexture: sceneTexture ?? undefined,
      },
      p, ui.state, input, theme,
    );
    windowEnd(sceneWin);

    // ── Audio/waveform placeholder window ─────────────────────────────────
    const audioWin = windowBegin(
      IDs.winAudio,
      { title: 'Audio', defaultRect: R.make(40, 560, 320, 140) },
      p, ui.state, input, theme,
    );
    if (audioWin.visible) {
      // Draw a fake waveform using horizontal quads
      const r = audioWin.contentRect;
      const barW = 3;
      const barGap = 1;
      const count  = Math.floor(r.w / (barW + barGap));
      for (let i = 0; i < count; i++) {
        const amp  = Math.sin(t * 4 + i * 0.3) * 0.5 + 0.5;
        const barH = amp * (r.h * 0.8);
        const bx   = r.x + i * (barW + barGap);
        const by   = r.y + r.h / 2 - barH / 2;
        const col  = C.lerp(theme.accent, C.hex(0x80c8ff), amp);
        p.fillRoundedRect({ x: bx, y: by, w: barW, h: barH }, col, 1);
      }
      windowEnd(audioWin);
    }

    // ── Minimised bar ─────────────────────────────────────────────────────
    miniBar(
      [
        { id: IDs.winControls, title: 'Controls'    },
        { id: IDs.winScene,    title: 'WebGPU Scene' },
        { id: IDs.winAudio,    title: 'Audio'        },
      ],
      { x: 16, y: vpH - 40 },
      p, ui.state, input, theme,
    );

    const repaint = ui.endFrame();
    needsRepaint = repaint;
    lastTime = now;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMVP(t: number, aspect: number): Float32Array {
  // Perspective matrix
  const fov  = Math.PI / 4;
  const near = 0.1, far = 100;
  const f    = 1 / Math.tan(fov / 2);
  const persp = new Float32Array([
    f / aspect, 0,  0,                        0,
    0,          f,  0,                        0,
    0,          0,  (far + near)/(near - far), -1,
    0,          0,  2*far*near/(near - far),   0,
  ]);

  // Rotation around Y and X
  const ry = t * 0.7, rx = t * 0.4;
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cx = Math.cos(rx), sx = Math.sin(rx);

  // Combined rotate + translate(0,0,-4)
  const rotY = new Float32Array([
     cy, 0, sy, 0,
     0,  1,  0, 0,
    -sy, 0, cy, 0,
     0,  0, -4, 1,
  ]);
  const rotX = new Float32Array([
    1,   0,  0, 0,
    0,  cx, -sx, 0,
    0,  sx,  cx, 0,
    0,   0,   0, 1,
  ]);

  return mat4Mul(mat4Mul(persp, rotX), rotY);
}

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        out[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return out;
}