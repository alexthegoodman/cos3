import { Ui, Shell } from '../index';
import { AppManager } from '../../sdk/app-manager';
import { globalRegistry, type RenderFunction } from '../../sdk/registry';
import { GUEST_UI_SCRIPT } from '../../sdk/spec';
import { CubeScene, PyramidScene } from './scenes';
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

  // 3. Simple App Script
  const appCode = `
    const { UI } = globalThis;

    UI.render(
      UI.Window({ title: 'My WebGPU App', width: 500, height: 600 },
        UI.Text({ content: 'Hello from Sandboxed JS!', size: 24 }),
        UI.Container({ layout: 'column', gap: 10 },
          UI.Text({ content: 'Below is a system-provided Cube:' }),
          UI.Image('gpu-scene', { sceneName: 'system::cube' }),
          UI.Button('Click Me', { onClick: 'onBtnClick' })
        )
      )
    );

    console.log("App initialized");
  `;

  manager.registerApp({
    id: 'demo.app',
    name: 'Demo App',
    version: '1.0.0'
  });

  await manager.launchApp('demo.app', GUEST_UI_SCRIPT + appCode);

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
           const [appId, name] = sceneName.split('::');
           const renderer = globalRegistry.getRenderer(appId, name);
           if (renderer) {
             // Host calls the registered renderer with the bridge context
             renderer.render(info.ctx, { time: t });
           }
         }
       }
    }

    shell.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
