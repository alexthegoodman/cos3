import { loadQuickJs } from "@sebastianwessel/quickjs";
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { Bridge } from "./bridge";

export class AppRuntime {
  private appId: string;
  private bridge: Bridge;
  private code: string;
  private sandbox: any;

  constructor(appId: string, bridge: Bridge, code: string) {
    this.appId = appId;
    this.bridge = bridge;
    this.code = code;
  }

  async start() {
    const { createSandbox } = await loadQuickJs(variant);

    this.sandbox = await createSandbox({
      callbacks: {
        __host_createWindow: async (opts: any) => {
          return await this.bridge.createWindow(this.appId, opts);
        },
        __host_addButton: async (winId: string, label: string, rect: any, cbId: number) => {
          return await this.bridge.addButton(winId, label, rect, () => {
            this.sandbox.evalCode(`cos3.__handleEvent(${cbId}, null)`);
          });
        },
        __host_addLabel: async (winId: string, text: string, rect: any) => {
          return await this.bridge.addLabel(winId, text, rect);
        },
        __host_updateWidget: async (widgetId: string, props: any) => {
          return await this.bridge.updateWidget(widgetId, props);
        },
      }
    });

    const sdkInitCode = `
      (function() {
        const callbacks = new Map();
        let nextCallbackId = 1;

        globalThis.cos3 = {
          id: "${this.appId}",
          ui: {
            createWindow: (opts) => __host_createWindow(opts),
            addButton: (winId, label, rect, onClick) => {
              const cbId = nextCallbackId++;
              callbacks.set(cbId, onClick);
              return __host_addButton(winId, label, rect, cbId);
            },
            addLabel: (winId, text, rect) => __host_addLabel(winId, text, rect),
            updateWidget: (widgetId, props) => __host_updateWidget(widgetId, props),
          },
          __handleEvent: (cbId, data) => {
            const cb = callbacks.get(cbId);
            if (cb) cb(data);
          }
        };
      })();
    `;

    await this.sandbox.evalCode(sdkInitCode);
    await this.sandbox.evalCode(this.code);
  }

  async stop() {
    if (this.sandbox) {
      await this.sandbox.dispose();
    }
  }
}
