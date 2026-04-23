import { type SandboxOptions, loadQuickJs } from "@sebastianwessel/quickjs";
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { Bridge } from "./bridge";

// loadQuickJs with a sync variant is NOT async - call once at module level
const { runSandboxed } = loadQuickJs(variant);

export class AppRuntime {
  private appId: string;
  private bridge: Bridge;
  private code: string;

  constructor(appId: string, bridge: Bridge, code: string) {
    this.appId = appId;
    this.bridge = bridge;
    this.code = code;
  }

  async start() {
    const sdkInitCode = `
      (function() {
        const callbacks = new Map();
        let nextCallbackId = 1;

        globalThis.cos3 = {
          id: "${this.appId}",
          ui: {
            createWindow: (opts) => env.__host_createWindow(opts),
            addButton: (winId, label, rect, onClick) => {
              const cbId = nextCallbackId++;
              callbacks.set(cbId, onClick);
              return env.__host_addButton(winId, label, rect, cbId);
            },
            addLabel: (winId, text, rect) => env.__host_addLabel(winId, text, rect),
            updateWidget: (widgetId, props) => env.__host_updateWidget(widgetId, props),
          },
          __handleEvent: (cbId, data) => {
            const cb = callbacks.get(cbId);
            if (cb) cb(data);
          }
        };
      })();
    `;

    const options: SandboxOptions = {
      env: {
        __host_createWindow: async (opts: any) => {
          return await this.bridge.createWindow(this.appId, opts);
        },
        __host_addButton: async (winId: string, label: string, rect: any, cbId: number) => {
          return await this.bridge.addButton(winId, label, rect, () => {
            // Trigger the callback inside the guest by calling evalCode again
            // evalCode is only available inside the runSandboxed callback, so
            // button callbacks need to be driven from outside via a message queue
            // or you can store evalCode reference (see note below)
          });
        },
        __host_addLabel: async (winId: string, text: string, rect: any) => {
          return await this.bridge.addLabel(winId, text, rect);
        },
        __host_updateWidget: async (widgetId: string, props: any) => {
          return await this.bridge.updateWidget(widgetId, props);
        },
      },
    };

    const result = await runSandboxed(async ({ evalCode }) => {
      // Store evalCode so host-initiated button callbacks can re-enter the guest
      this.evalCode = evalCode;

      await evalCode(sdkInitCode);
      return evalCode(this.code);
    }, options);

    return result;
  }

  // Allows the host (e.g. button callbacks) to invoke guest event handlers
  // after start() has been called
  private evalCode?: (code: string) => Promise<any>;

  async dispatchEvent(cbId: number, data: any) {
    if (this.evalCode) {
      await this.evalCode(`cos3.__handleEvent(${cbId}, ${JSON.stringify(data)})`);
    }
  }

  // stop() is no longer needed - runSandboxed manages its own lifecycle
}