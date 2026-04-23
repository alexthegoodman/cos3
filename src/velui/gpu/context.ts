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
   * Create an OffscreenCanvas and configure it with a WebGPU context.
   * This acts as a bridge: WebGPU renders here, Konva uses it as an Image source.
   */
  createBridgeCanvas(w: number, h: number): { canvas: OffscreenCanvas, ctx: GPUCanvasContext } {
    const canvas = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    const ctx    = canvas.getContext('webgpu') as GPUCanvasContext;
    ctx.configure({
      device:    this.device,
      format:    this.format,
      alphaMode: 'premultiplied',
    });
    return { canvas, ctx };
  }

  /** Resize an existing bridge canvas and reconfigure its context. */
  resizeBridgeCanvas(bridge: { canvas: OffscreenCanvas, ctx: GPUCanvasContext }, w: number, h: number) {
    const nw = Math.max(1, Math.floor(w));
    const nh = Math.max(1, Math.floor(h));
    if (bridge.canvas.width === nw && bridge.canvas.height === nh) return;

    bridge.canvas.width = nw;
    bridge.canvas.height = nh;
    bridge.ctx.configure({
      device:    this.device,
      format:    this.format,
      alphaMode: 'premultiplied',
    });
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
        GPUTextureUsage.COPY_DST          |
        GPUTextureUsage.COPY_SRC,
    });
  }

  /**
   * Copies a GPUTexture to a CPU-side ImageBitmap.
   * Uses a temporary buffer and copyTextureToBuffer.
   */
  async copyTextureToBitmap(tex: GPUTexture): Promise<ImageBitmap> {
    const w = tex.width;
    const h = tex.height;

    // 1. Calculate alignment (bytesPerRow must be multiple of 256)
    const bytesPerPixel = 4; // Assuming RGBA8Unorm or BGRA8Unorm
    const unalignedBytesPerRow = w * bytesPerPixel;
    const bytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
    const bufferSize = bytesPerRow * h;

    // 2. Create/Reuse buffer (for simplicity now, we create one, but in production we'd pool)
    const buffer = this.device.createBuffer({
      label: 'copy-tex-buffer',
      size:  bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // 3. Encode copy
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer(
      { texture: tex },
      { buffer, bytesPerRow },
      [w, h]
    );
    this.device.queue.submit([enc.finish()]);

    // 4. Map and Read
    await buffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = buffer.getMappedRange();
    
    // Konva / Canvas needs a Uint8ClampedArray for ImageData
    // If we have padding, we must strip it or use a subset
    let data = new Uint8ClampedArray(arrayBuffer);
    
    if (bytesPerRow !== unalignedBytesPerRow) {
      // Manual row-by-row copy to strip padding
      const stripped = new Uint8ClampedArray(unalignedBytesPerRow * h);
      for (let y = 0; y < h; y++) {
        const srcOffset = y * bytesPerRow;
        const dstOffset = y * unalignedBytesPerRow;
        stripped.set(data.subarray(srcOffset, srcOffset + unalignedBytesPerRow), dstOffset);
      }
      data = stripped;
    } else {
      // Just clone it because unmap() will invalidate the mapped range
      data = new Uint8ClampedArray(data);
    }

    buffer.unmap();
    buffer.destroy();

    // 5. Convert to ImageBitmap
    const imageData = new ImageData(data, w, h);
    return await createImageBitmap(imageData);
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