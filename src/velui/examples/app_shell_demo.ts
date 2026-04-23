import { Ui, Shell } from '../index';
import { AppManager } from '../../sdk/app-manager';
import { globalRegistry, type RenderFunction } from '../../sdk/registry';
import { GUEST_UI_SCRIPT } from '../../sdk/spec';
import { CubeScene, PyramidScene, PlaneScene, ParticleScene } from './scenes';
import type { SandboxHostAPIs } from '../../sdk/sandbox';

export default async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ui = await Ui.init(canvas);
  const shell = new Shell(ui);
  const bridge = shell.getUIBridge();

  // 1. Host APIs for the Sandbox
  const hostAPIs: SandboxHostAPIs = {
    graphics: {
      createBuffer: () => '',
      updateBuffer: () => {},
      createTexture: () => '',
      updateTexture: () => {},
      createPipeline: () => '',
      dispatchCompute: () => {},
      createMesh: () => '',
      createLight: () => {},
    },
    audio: {
      play: () => '',
      stop: () => {},
      setVolume: () => {},
    },
    window: {
      getSize: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      }),
      requestNotification: (title, body) => console.log('Notification:', title, body),
    },
    ui: {
      renderUITree: (appId, node) => {
        bridge.render(appId, node);
      },
    },
  };

  const manager = new AppManager({ host: hostAPIs });

  // 2. Register native WebGPU renderers so apps can use them
  const cube = new CubeScene();
  await cube.init(ui.gpu.device, ui.gpu.format);
  globalRegistry.registerRenderer('system', 'cube', 'webgpu', cube.renderTo.bind(cube) as any);

  const pyramid = new PyramidScene();
  await pyramid.init(ui.gpu.device, ui.gpu.format);
  globalRegistry.registerRenderer('system', 'pyramid', 'webgpu', pyramid.renderTo.bind(pyramid) as any);

  const plane = new PlaneScene();
  await plane.init(ui.gpu.device, ui.gpu.format);
  globalRegistry.registerRenderer('system', 'plane', 'webgpu', plane.renderTo.bind(plane) as any);

  const particles = new ParticleScene();
  await particles.init(ui.gpu.device, ui.gpu.format);
  globalRegistry.registerRenderer('system', 'particles', 'webgpu', particles.renderTo.bind(particles) as any);

  // 3. Simple App Scripts
  const createAppScript = (title: string, scene: string, content: string) => `
    const { UI } = globalThis;

    UI.render(
      UI.Window({ title: '${title}', width: 400, height: 450 },
        UI.Text({ content: '${content}', size: 18 }),
        UI.Container({ layout: 'column', gap: 10 },
          UI.Image('gpu-scene', { sceneName: 'system::${scene}' }),
          // UI.Button('Action', { onClick: 'onBtnClick' })
        )
      )
    );
  `;

  const apps = [
    { id: 'cube.app', name: 'Cube Viewer', scene: 'cube', desc: 'A rotating 3D Cube' },
    { id: 'pyramid.app', name: 'Pyramid Power', scene: 'pyramid', desc: 'Mystical geometric shapes' },
    { id: 'plane.app', name: 'Grid World', scene: 'plane', desc: 'Infinite checkerboard' },
    { id: 'particles.app', name: 'Star Field', scene: 'particles', desc: '1,000 floating points' },
  ];

  for (let i = 0; i < apps.length; i++) {
    const app = apps[i];
    manager.registerApp({
      id: app.id,
      name: app.name,
      version: '1.0.0'
    });
    
    // Staggered launch
    setTimeout(async () => {
      await manager.launchApp(app.id, GUEST_UI_SCRIPT + createAppScript(app.name, app.scene, app.desc));
    }, i * 500);
  }

  // 4. Main Render Loop
  async function frame(time: number) {
    const t = time / 1000;

    // Find all windows and their GPU scenes
    for (const win of bridge.getWindows()) {
       const gpuImages = win.find('.gpu-scene-image');
       for (const img of gpuImages) {
         const info = (img as any)._gpuBridge;
         const sceneName = (img as any)._sceneName;
         if (info && sceneName) {
           // Resize bridge if needed
           if (info.canvas.width !== Math.floor(img.width()) || info.canvas.height !== Math.floor(img.height())) {
             ui.gpu.resizeBridgeCanvas(info, img.width(), img.height());
           }

           const [appId, name] = sceneName.split('::');
           const renderer = globalRegistry.getRenderer(appId, name);
           if (renderer) {
             // Host calls the registered renderer with the bridge context
             // renderTo signature: (device, queue, target, time)
             renderer.render(ui.gpu.device, ui.gpu.device.queue, info.ctx, t);
             // Manually mark the Konva image as dirty because it uses a bridge canvas
             img.getLayer()?.batchDraw();
           }
         }
       }
    }

    shell.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
