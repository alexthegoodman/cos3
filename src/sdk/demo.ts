import { Ui } from '../velui';
import { Bridge } from './bridge';
import { AppRuntime } from './runtime';
import { Registry } from './registry';

export default async function sdkDemo() {
  const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
  const ui = await Ui.init(canvas);
  const bridge = new Bridge(ui);
  const registry = Registry.getInstance();

  const appCode = `
    async function main() {
      const winId = await cos3.ui.createWindow({
        title: "My SDK App",
        width: 400,
        height: 300,
        x: 50,
        y: 50
      });

      await cos3.ui.addLabel(winId, "Hello from QuickJS!", { x: 20, y: 20, w: 200, h: 30 });

      let count = 0;
      const countLabelId = await cos3.ui.addLabel(winId, "Count: 0", { x: 20, y: 60, w: 200, h: 30 });

      await cos3.ui.addButton(winId, "Increment", { x: 20, y: 100, w: 120, h: 40 }, async () => {
        count++;
        console.log("Button clicked in SDK! Count:", count);
        await cos3.ui.updateWidget(countLabelId, { text: \`Count: \${count}\` });
      });
    }

    main().catch(console.error);
  `;

  const runtime = new AppRuntime('test.app.com', bridge, appCode);
  registry.registerApp({
    id: 'test.app.com',
    name: 'Test App',
    version: '1.0.0'
  }, appCode, runtime);

  await runtime.start();

  // Keep rendering
  function frame() {
    ui.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
