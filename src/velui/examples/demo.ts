import {
  Ui, Window, Button, Label, Tabs,
  LayoutCursor,
} from '../index';
import { CubeScene, PyramidScene, PlaneScene, ParticleScene, Scene } from './scenes';

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export default async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
  canvas.width = 1600;
  canvas.height = 800;
  const ui     = await Ui.init(canvas);
  const theme  = ui.theme;

  // 1. Setup WebGPU Scenes
  const scenes = [
    { name: 'Cube',      scene: new CubeScene(),      x: 400, y: 40,  w: 440, h: 360 },
    { name: 'Pyramid',   scene: new PyramidScene(),   x: 860, y: 40,  w: 440, h: 360 },
    { name: 'Plane',     scene: new PlaneScene(),     x: 400, y: 420, w: 440, h: 360 },
    { name: 'Particles', scene: new ParticleScene(),  x: 860, y: 420, w: 440, h: 360 },
  ];

  const sceneInstances: { win: Window, tex: GPUTexture, scene: Scene }[] = [];

  for (const s of scenes) {
    await s.scene.init(ui.gpu.device, ui.gpu.format);
    const tex = ui.gpu.createWindowTexture(s.w, s.h, `${s.name}-texture`);
    
    const win = new Window({
      title:        `${s.name} Scene`,
      x:            s.x,
      y:            s.y,
      width:        s.w,
      height:       s.h,
    }, theme);
    ui.layer.add(win);
    
    sceneInstances.push({ win, tex, scene: s.scene });
  }

  // ── Controls Window ───────────────────────────────────────────────────
  const ctrlWin = new Window({
    title:  'Controls',
    x:      40,
    y:      40,
    width:  320,
    height: 480,
  }, theme);
  ui.layer.add(ctrlWin);

  const cur = new LayoutCursor(
    { x: 0, y: 0, w: ctrlWin.contentArea.width(), h: ctrlWin.contentArea.height() },
    theme.padding, theme.gap
  );

  const mainTabs = new Tabs(['Widgets', 'About'], cur.next(32), theme, (idx) => {
    console.log('Tab changed to:', idx);
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

  // 3. Render Loop
  async function frame(time: number) {
    const t = time / 1000;

    for (const inst of sceneInstances) {
      // 1. Update WebGPU scene
      inst.scene.renderTo(ui.gpu.device, ui.gpu.device.queue, inst.tex, t);

      // 2. Copy GPU texture to ImageBitmap
      const bitmap = await ui.gpu.copyTextureToBitmap(inst.tex);
      
      // 3. Update Konva window content
      inst.win.setContentImage(bitmap);
    }

    // 4. Redraw Konva layer
    ui.render();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
