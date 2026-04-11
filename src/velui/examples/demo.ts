import {
  Ui, Window, Button, Label, Tabs,
  ColorUtils as C, RectUtils as R,
  LayoutCursor,
} from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// 3D scene renderer (WebGPU bridge)
// ─────────────────────────────────────────────────────────────────────────────

class CubeScene {
  private pipeline!: GPURenderPipeline;
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
        vec3f(-1,-1, 1), vec3f( 1,-1, 1), vec3f( 1, 1, 1),
        vec3f(-1,-1, 1), vec3f( 1, 1, 1), vec3f(-1, 1, 1),
        vec3f( 1,-1,-1), vec3f(-1,-1,-1), vec3f(-1, 1,-1),
        vec3f( 1,-1,-1), vec3f(-1, 1,-1), vec3f( 1, 1,-1),
        vec3f(-1,-1,-1), vec3f(-1,-1, 1), vec3f(-1, 1, 1),
        vec3f(-1,-1,-1), vec3f(-1, 1, 1), vec3f(-1, 1,-1),
        vec3f( 1,-1, 1), vec3f( 1,-1,-1), vec3f( 1, 1,-1),
        vec3f( 1,-1, 1), vec3f( 1, 1,-1), vec3f( 1, 1, 1),
        vec3f(-1, 1, 1), vec3f( 1, 1, 1), vec3f( 1, 1,-1),
        vec3f(-1, 1, 1), vec3f( 1, 1,-1), vec3f(-1, 1,-1),
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
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex:   { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
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

  renderTo(device: GPUDevice, queue: GPUQueue, target: GPUCanvasContext, t: number) {
    if (!this.ready) return;
    const canvas = target.canvas as OffscreenCanvas;
    const w = canvas.width, h = canvas.height;

    if (!this.depthTex || this.depthTex.width !== w || this.depthTex.height !== h) {
      this.depthTex?.destroy();
      this.depthTex = device.createTexture({
        size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    const aspect = w / h;
    const mvp    = buildMVP(t, aspect);
    queue.writeBuffer(this.uniformBuf, 0, mvp.buffer);

    const enc  = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view:       target.getCurrentTexture().createView(),
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
  const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
  canvas.width = 1600;
  canvas.height = 800;
  const ui     = await Ui.init(canvas);
  const theme  = ui.theme;

  // 1. Setup WebGPU Bridge
  const cube = new CubeScene();
  await cube.init(ui.gpu.device, ui.gpu.format);
  const bridge = ui.gpu.createBridgeCanvas(400, 300);

  // 2. Create Windows (Persistent Konva Nodes)
  
  // ── Controls Window ───────────────────────────────────────────────────
  const ctrlWin = new Window({
    title:  'Controls',
    x:      40,
    y:      40,
    width:  320,
    height: 480,
  }, theme);
  ui.layer.add(ctrlWin);

  // Layout relative to contentArea
  const cur = new LayoutCursor(
    { x: 0, y: 0, w: ctrlWin.contentArea.width(), h: ctrlWin.contentArea.height() },
    theme.padding, theme.gap
  );

  // Tabs
  const mainTabs = new Tabs(['Widgets', 'About'], cur.next(32), theme, (idx) => {
    console.log('Tab changed to:', idx);
    // In a real app, you'd show/hide groups here
  });
  ctrlWin.contentArea.add(mainTabs);

  const welcomeLabel = new Label('Konva VelUI', cur.next(30), theme);
  ctrlWin.contentArea.add(welcomeLabel);

  const myButton = new Button('Increment Counter', cur.next(40), theme);
  ctrlWin.contentArea.add(myButton);

  let count = 0;
  const countLabel = new Label(`Count: ${count}`, cur.next(24), theme, theme.textDim);
  ctrlWin.contentArea.add(countLabel);

  myButton.on('click tap', () => {
    count++;
    countLabel.text(`Count: ${count}`);
    ui.render();
  });

  // ── WebGPU Scene Window ───────────────────────────────────────────────
  const sceneWin = new Window({
    title:        'WebGPU Scene',
    x:            400,
    y:            40,
    width:        440,
    height:       360,
    bridgeCanvas: bridge.canvas,
  }, theme);
  ui.layer.add(sceneWin);

  // 3. Render Loop
  function frame(time: number) {
    const t = time / 1000;

    // Update WebGPU scene
    cube.renderTo(ui.gpu.device, ui.gpu.device.queue, bridge.ctx, t);

    // Redraw Konva layer (important for the bridge canvas update)
    ui.render();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMVP(t: number, aspect: number): Float32Array {
  const fov  = Math.PI / 4;
  const near = 0.1, far = 100;
  const f    = 1 / Math.tan(fov / 2);
  const persp = new Float32Array([
    f / aspect, 0,  0,                        0,
    0,          f,  0,                        0,
    0,          0,  (far + near)/(near - far), -1,
    0,          0,  2*far*near/(near - far),   0,
  ]);
  const ry = t * 0.7, rx = t * 0.4;
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const rotY = new Float32Array([ cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0, 0, 0, -4, 1 ]);
  const rotX = new Float32Array([ 1, 0, 0, 0, 0, cx, -sx, 0, 0, sx, cx, 0, 0, 0, 0, 1 ]);
  return mat4Mul(mat4Mul(persp, rotX), rotY);
}

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}
