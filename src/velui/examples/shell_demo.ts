import { Ui, Shell, Window, Button, Label, LayoutCursor } from '../index';

export default async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
  
  // Set initial canvas size to window size
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ui = await Ui.init(canvas);
  const shell = new Shell(ui);
  const theme = ui.theme;

  // 1. Set a nice wallpaper (gradient-ish color or image)
  shell.setWallpaper('#1a1a2e'); // Deep blue

  // 2. Create a "Welcome" Window
  const welcomeWin = new Window({
    title: 'Welcome to CommonOS',
    x: 100,
    y: 100,
    width: 400,
    height: 300,
  }, theme);
  shell.addWindow(welcomeWin);

  const cur = new LayoutCursor(
    { x: 0, y: 0, w: welcomeWin.contentArea.width(), h: welcomeWin.contentArea.height() },
    theme.padding, theme.gap
  );

  welcomeWin.contentArea.add(new Label('Experience the next-gen OS.', cur.next(30), theme));
  
  const btn = new Button('Change Wallpaper', cur.next(40), theme);
  welcomeWin.contentArea.add(btn);

  let bgIdx = 0;
  const bgs = ['#1a1a2e', '#16213e', '#0f3460', '#533483'];
  btn.on('click tap', () => {
    bgIdx = (bgIdx + 1) % bgs.length;
    shell.setWallpaper(bgs[bgIdx]);
  });

  // 3. Render loop
  function frame() {
    shell.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
