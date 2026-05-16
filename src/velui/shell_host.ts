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
    'calculator.app': './src/apps/calculator.js',
    'cube.app': './src/apps/cube.js',
    'pyramid.app': './src/apps/pyramid.js',
    'particles.app': './src/apps/particles.js',
    'plane.app': './src/apps/plane.js'
  };

  const apps = [
    { id: 'calculator.app', name: 'Calculator' },
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
  let lastTime = 0;

  // Wallpaper Pipelines
  const wallpaperShaders: Record<string, string> = {
    aurora: `
      @vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
        var pos = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
        return vec4f(pos[vi], 0, 1);
      }
      @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
        let uv = pos.xy / vec2f(2000, 1000);
        let t = COS3_TIME * 0.2;
        let color = vec3f(0.05, 0.1, 0.15) + 0.1 * vec3f(
          sin(uv.x * 5.0 + t) * 0.5 + 0.5,
          sin(uv.y * 3.0 - t * 1.5) * 0.5 + 0.5,
          sin((uv.x + uv.y) * 2.0 + t) * 0.5 + 0.5
        );
        return vec4f(color * 0.6, 1.0);
      }
    `,
    nebula: `
      @vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
        var pos = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
        return vec4f(pos[vi], 0, 1);
      }
      @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
        let uv = pos.xy / vec2f(2000, 1000);
        let t = COS3_TIME * 0.1;
        let color = vec3f(0.1, 0.05, 0.15) + 0.12 * vec3f(
          cos(uv.x * 2.0 - t) * 0.5 + 0.5,
          sin(uv.y * 4.0 + t * 0.8) * 0.5 + 0.5,
          cos((uv.x - uv.y) * 3.0 + t * 1.2) * 0.5 + 0.5
        );
        return vec4f(color * 0.5, 1.0);
      }
    `,
    cosmic: `
      @vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
        var pos = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
        return vec4f(pos[vi], 0, 1);
      }
      @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
        let uv = pos.xy / vec2f(2000, 1000);
        let t = COS3_TIME * 0.05;
        let s = sin(uv.x * 10.0 + t) * cos(uv.y * 10.0 - t);
        let color = vec3f(0.02, 0.02, 0.05) + 0.05 * vec3f(s + 0.5);
        return vec4f(color, 1.0);
      }
    `
  };

  const wallPipelines = new Map<string, GPURenderPipeline>();
  for (const [name, code] of Object.entries(wallpaperShaders)) {
    const mod = ui.gpu.device.createShaderModule({ code: code.replace('COS3_TIME', 't') });
    const pipe = ui.gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: ui.gpu.format }] },
      primitive: { topology: 'triangle-list' }
    });
    wallPipelines.set(name, pipe);
  }

  async function frame(time: number) {
    const dt = (time - (lastTime || time)) / 1000;
    lastTime = time;

    const t = time / 1000;
    
    shell.update(dt);

    // Render Wallpaper Shader if active
    const wallState = shell.getWallpaperState();
    if (wallState.type !== 'static' && wallState.bridge) {
       const pipe = wallPipelines.get(wallState.type);
       if (pipe) {
         // Re-compile with time if needed, or use a uniform. 
         // For simplicity, we'll just re-create a small shader module for now 
         // OR better: use a uniform for time.
         // Let's use a uniform for time to be efficient.
       }
       
       // Simple version: Re-compile shader with time constant for this demo 
       // (Not efficient but easy to plug into the current triangle-list setup)
       const mod = ui.gpu.device.createShaderModule({ 
         code: wallpaperShaders[wallState.type as keyof typeof wallpaperShaders].replace(/COS3_TIME/g, t.toFixed(4)) 
       });
       const pipe2 = ui.gpu.device.createRenderPipeline({
         layout: 'auto',
         vertex: { module: mod, entryPoint: 'vs' },
         fragment: { module: mod, entryPoint: 'fs', targets: [{ format: ui.gpu.format }] },
         primitive: { topology: 'triangle-list' }
       });

       const enc = ui.gpu.device.createCommandEncoder();
       const pass = enc.beginRenderPass({
         colorAttachments: [{ view: wallState.bridge.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }]
       });
       pass.setPipeline(pipe2);
       pass.draw(3);
       pass.end();
       ui.gpu.device.queue.submit([enc.finish()]);
    }

    for (const win of bridge.getWindows()) {
       const gpuImages = win.find('.gpu-scene-image');
       for (const img of gpuImages) {
         const info = (img as any)._gpuBridge; // contains canvas and ctx
         const props = img.getAttrs();
         const rendererName = props.renderer;

        //  console.info("gpu image", info, rendererName)
         
         if (info && rendererName) {
           if (info.canvas.width !== Math.floor(img.width()) || info.canvas.height !== Math.floor(img.height())) {
             ui.gpu.resizeBridgeCanvas(info, img.width(), img.height());
           }

           const [appId, name] = rendererName.split('::');
           const renderer = globalRegistry.getRenderer(appId, name);
           if (renderer) {
            // console.info("got renderer", appId)
             const params = { time: t, width: info.canvas.width, height: info.canvas.height, ...props };
             const commands = await renderer.render(info.ctx, params) as any;
             
             if (Array.isArray(commands)) {
                executeCommands(ui.gpu.device, ui.gpu.device.queue, info.ctx, commands, t, depthTexMap);
                img.getLayer()?.batchDraw();
             }
           }
         }
       }
    }
    shell.render();
    requestAnimationFrame(frame);
  }

  function executeCommands(device: GPUDevice, queue: GPUQueue, target: GPUCanvasContext, commands: any[], t: number, depthMap: Map<string, GPUTexture>) {
     const w = target.canvas.width, h = target.canvas.height;
     const depthKey = w + 'x' + h;
     let depthTex = depthMap.get(depthKey);
     if (!depthTex) {
       depthTex = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
       depthMap.set(depthKey, depthTex);
     }

     const enc = device.createCommandEncoder();
     const pass = enc.beginRenderPass({
       colorAttachments: [{ view: target.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1 } }],
       depthStencilAttachment: { view: depthTex.createView(), depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 }
     });

     for (const cmd of commands) {
       switch (cmd.type) {
         case 'setPipeline':
           const pipe = gpuResources.pipelines.get(cmd.id);
           if (pipe) pass.setPipeline(pipe);
           break;
         case 'setMesh':
           const mesh = gpuResources.meshes.get(cmd.id);
           if (mesh) {
             pass.setVertexBuffer(0, mesh.v);
             if (mesh.i) pass.setIndexBuffer(mesh.i, 'uint16');
           }
           break;
         case 'setBuffer':
           const buf = gpuResources.buffers.get(cmd.id);
           if (buf && cmd.role === 'mvp') {
             // Mock MVP update
             const mvp = new Float32Array(16);
             mvp[0]=Math.cos(t); mvp[2]=Math.sin(t); mvp[5]=1; mvp[8]=-Math.sin(t); mvp[10]=Math.cos(t); mvp[15]=1;
             queue.writeBuffer(buf, 0, mvp);
             
             // Auto-bind for the demo
             // In a real system, the app would specify the group/binding
             const bgl = (pass as any)._currentPipeline?.getBindGroupLayout(0);
             if (bgl) {
                const bg = device.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: buf } }] });
                pass.setBindGroup(0, bg);
             }
           }
           break;
         case 'draw':
           // We need to know the vertex count. In a real impl, it's stored with the mesh.
           // For the demo, we'll assume the last set mesh
           const currentMesh = commands.filter(c => c.type === 'setMesh').pop();
           const meshData = gpuResources.meshes.get(currentMesh?.id);
           if (meshData) {
             if (meshData.i) pass.drawIndexed(meshData.count);
             else pass.draw(meshData.count);
           }
           break;
       }
       
       // Track state for auto-bind logic
       if (cmd.type === 'setPipeline') (pass as any)._currentPipeline = gpuResources.pipelines.get(cmd.id);
     }

     pass.end();
     queue.submit([enc.finish()]);
  }

  requestAnimationFrame(frame);
}
