/**
 * GpuContext — owns the single shared GPUDevice that the compositor and all
 * first-party app windows share.
 *
 * App windows that want zero-copy texture compositing call
 * `ctx.createWindowTexture(w, h)` to get a GPUTexture they render into.
 * Third-party / sandboxed windows use `ctx.uploadExternalImage(source)`
 * to upload from an OffscreenCanvas / VideoFrame / ImageBitmap each frame.
 */
export class GpuContext {
  private constructor(
    readonly adapter:  GPUAdapter,
    readonly device:   GPUDevice,
    readonly format:   GPUTextureFormat,
  ) {}

  static async init(): Promise<GpuContext> {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser.');
    }
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) throw new Error('No WebGPU adapter found.');

    const device = await adapter.requestDevice({
      label: 'velui-shared',
    });
    device.lost.then((info) => {
      console.error('WebGPU device lost:', info.message);
    });

    const format = navigator.gpu.getPreferredCanvasFormat();
    return new GpuContext(adapter, device, format);
  }

  /** Configure a canvas for presentation. */
  configureCanvas(canvas: HTMLCanvasElement): GPUCanvasContext {
    const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
    ctx.configure({
      device:     this.device,
      format:     this.format,
      alphaMode:  'premultiplied',
    });
    return ctx;
  }

  /**
   * Create a render-target texture for a first-party window.
   * The app renders into this; the compositor samples it.
   */
  createWindowTexture(w: number, h: number, label = ''): GPUTexture {
    return this.device.createTexture({
      label,
      size:   [Math.max(1, w), Math.max(1, h), 1],
      format: this.format,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING   |
        GPUTextureUsage.COPY_DST,
    });
  }

  /**
   * Upload an external image source (OffscreenCanvas, VideoFrame, ImageBitmap,
   * HTMLCanvasElement) into an existing texture, or create a new one.
   *
   * This is the integration point for mediabunny / Three / Canvas 2D windows.
   */
  uploadExternalImage(
    source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas | VideoFrame | any, // any to allow optional source
    existing?: GPUTexture,
  ): GPUTexture {
    const w = 'videoWidth' in source ? source.videoWidth   : source.width;
    const h = 'videoHeight' in source ? source.videoHeight : source.height;

    const tex = existing ?? this.createWindowTexture(w, h);

    this.device.queue.copyExternalImageToTexture(
      { source: source as ImageBitmap, flipY: false },
      { texture: tex, premultipliedAlpha: true },
      [w, h],
    );
    return tex;
  }

  /** Utility: create a plain RGBA sampler suitable for UI compositing. */
  createLinearSampler(): GPUSampler {
    return this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });
  }

  createNearestSampler(): GPUSampler {
    return this.device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
    });
  }

  /** Resize a window texture if dimensions changed. Returns old or new texture. */
  resizeWindowTexture(tex: GPUTexture, w: number, h: number): GPUTexture {
    if (tex.width === w && tex.height === h) return tex;
    tex.destroy();
    return this.createWindowTexture(w, h, tex.label);
  }
}