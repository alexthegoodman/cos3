import { Ui, Shell } from './index';
import { AppManager } from '../sdk/app-manager';
import { globalRegistry } from '../sdk/registry';
import { GUEST_UI_SCRIPT } from '../sdk/spec';
import type { SandboxHostAPIs } from '../sdk/sandbox';

export default async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ui = await Ui.init(canvas);
  const shell = new Shell(ui);
  const bridge = shell.getUIBridge();

  // 1. Host APIs for the Sandbox
  const gpuResources = {
    buffers: new Map<string, GPUBuffer>(),
    textures: new Map<string, GPUTexture>(),
    pipelines: new Map<string, GPURenderPipeline>(),
    meshes: new Map<string, { v: GPUBuffer, i?: GPUBuffer, count: number }>()
  };

  const hostAPIs: SandboxHostAPIs = {
    graphics: {
      createBuffer: (desc) => {
        const id = 'buf_' + Math.random().toString(36).substring(7);
        const buf = ui.gpu.device.createBuffer({
          size: desc.size,
          usage: desc.usage | GPUBufferUsage.COPY_DST,
          mappedAtCreation: !!desc.data
        });
        if (desc.data) {
          new (desc.data as any).constructor(buf.getMappedRange()).set(desc.data);
          buf.unmap();
        }
        gpuResources.buffers.set(id, buf);
        return id;
      },
      updateBuffer: (id, data) => {
        const buf = gpuResources.buffers.get(id);
        if (buf) ui.gpu.device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
      },
      createTexture: (desc) => {
        const id = 'tex_' + Math.random().toString(36).substring(7);
        const tex = ui.gpu.device.createTexture({
          size: [desc.width, desc.height, 1],
          format: desc.format,
          usage: desc.usage
        });
        gpuResources.textures.set(id, tex);
        return id;
      },
      updateTexture: (id, data) => {},
      createPipeline: (cfg) => {
        const id = 'pipe_' + Math.random().toString(36).substring(7);
        const vMod = ui.gpu.device.createShaderModule({ code: cfg.vertexShader! });
        const fMod = ui.gpu.device.createShaderModule({ code: cfg.fragmentShader! });

        const layoutEntries = cfg.bindings.map(b => ({
          binding: b.binding,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: b.type === 'uniform' ? { type: 'uniform' as const } : undefined,
        }));

        const bgl = ui.gpu.device.createBindGroupLayout({ entries: layoutEntries });
        const pipeline = ui.gpu.device.createRenderPipeline({
          layout: ui.gpu.device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
          vertex: { 
            module: vMod, entryPoint: 'vs',
            buffers: [{
              arrayStride: 12,
              attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 0 }]
            }]
          },
          fragment: { module: fMod, entryPoint: 'fs', targets: [{ format: ui.gpu.format }] },
          depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
          primitive: { topology: 'triangle-list' }
        });
        gpuResources.pipelines.set(id, pipeline);
        return id;
      },
      dispatchCompute: (pid, x, y, z) => {},
      createMesh: (desc) => {
        const id = 'mesh_' + Math.random().toString(36).substring(7);
        const vBuf = ui.gpu.device.createBuffer({
          size: desc.vertices.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        ui.gpu.device.queue.writeBuffer(vBuf, 0, desc.vertices);
        let iBuf: GPUBuffer | undefined;
        if (desc.indices) {
          iBuf = ui.gpu.device.createBuffer({
            size: desc.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
          });
          ui.gpu.device.queue.writeBuffer(iBuf, 0, desc.indices);
        }
        gpuResources.meshes.set(id, { v: vBuf, i: iBuf, count: desc.indices ? desc.indices.length : desc.vertices.length / 3 });
        return id;
      },
      createLight: (desc) => 'light_' + Math.random().toString(36).substring(7),
    },
    audio: {
      play: () => '', stop: () => {}, setVolume: () => {},
    },
    window: {
      getSize: () => ({ width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio }),
      requestNotification: (title, body) => console.log('Notification:', title, body),
    },
    ui: {
      renderUITree: (appId, node) => { bridge.render(appId, node); },
    },
  };

  const manager = new AppManager({ host: hostAPIs });

  // 2. Script loading from /src/apps/
  const APP_URLS: Record<string, string> = {
    'cube.app': './src/apps/cube.js',
    'pyramid.app': './src/apps/pyramid.js',
    'particles.app': './src/apps/particles.js',
    'plane.app': './src/apps/plane.js'
  };

  const apps = [
    { id: 'cube.app', name: 'SDK Cube' },
    { id: 'pyramid.app', name: 'Pyramid' },
    { id: 'plane.app', name: 'Grid' },
    { id: 'particles.app', name: 'Stars' },
  ];

  for (const app of apps) {
    manager.registerApp({ id: app.id, name: app.name, version: '1.0.0' });
  }

  shell.setAppManager(manager, async (appId) => {
    if (!manager.isRunning(appId)) {
      const url = APP_URLS[appId];
      if (url) {
        try {
          const script = await loadScript(url);
          await manager.launchApp(appId, GUEST_UI_SCRIPT + script);
        } catch (err) {
          console.error(`Failed to load app ${appId}:`, err);
        }
      }
    }
  });

  async function loadScript(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    return await resp.text();
  }

  const depthTexMap = new Map<string, GPUTexture>();

  async function frame(time: number) {
    const t = time / 1000;
    for (const win of bridge.getWindows()) {
       const gpuImages = win.find('.gpu-scene-image');
       for (const img of gpuImages) {
         const info = (img as any)._gpuBridge;
         const props = img.getAttrs();
         const rendererName = props.renderer; 
         if (info && rendererName) {
           if (info.canvas.width !== Math.floor(img.width()) || info.canvas.height !== Math.floor(img.height())) {
             ui.gpu.resizeBridgeCanvas(info, img.width(), img.height());
           }
           if (props.pipeline && props.mesh) {
             const pipeline = gpuResources.pipelines.get(props.pipeline);
             const mesh = gpuResources.meshes.get(props.mesh);
             const mvpBuf = gpuResources.buffers.get(props.mvp);
             if (pipeline && mesh) {
               renderSDKScene(ui.gpu.device, ui.gpu.device.queue, info.ctx, pipeline, mesh, mvpBuf, t, depthTexMap);
               img.getLayer()?.batchDraw();
               continue;
             }
           }
         }
       }
    }
    shell.render();
    requestAnimationFrame(frame);
  }

  function renderSDKScene(device: GPUDevice, queue: GPUQueue, target: GPUCanvasContext, pipeline: GPURenderPipeline, mesh: any, mvpBuf: GPUBuffer | undefined, t: number, depthMap: Map<string, GPUTexture>) {
     const w = target.canvas.width, h = target.canvas.height;
     const depthKey = w + 'x' + h;
     let depthTex = depthMap.get(depthKey);
     if (!depthTex) {
       depthTex = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
       depthMap.set(depthKey, depthTex);
     }

     if (mvpBuf) {
       const mvp = new Float32Array(16);
       mvp[0]=Math.cos(t); mvp[2]=Math.sin(t); mvp[5]=1; mvp[8]=-Math.sin(t); mvp[10]=Math.cos(t); mvp[15]=1;
       queue.writeBuffer(mvpBuf, 0, mvp);
     }

     const enc = device.createCommandEncoder();
     const pass = enc.beginRenderPass({
       colorAttachments: [{ view: target.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1 } }],
       depthStencilAttachment: { view: depthTex.createView(), depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 }
     });
     pass.setPipeline(pipeline);
     pass.setVertexBuffer(0, mesh.v);
     if (mvpBuf) {
       const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: mvpBuf } }] });
       pass.setBindGroup(0, bg);
     }
     if (mesh.i) { pass.setIndexBuffer(mesh.i, 'uint16'); pass.drawIndexed(mesh.count); }
     else { pass.draw(mesh.count); }
     pass.end();
     queue.submit([enc.finish()]);
  }

  requestAnimationFrame(frame);
}
