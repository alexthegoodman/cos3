import type { GpuContext } from './context';
import type { Color } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// WGSL shaders
// ─────────────────────────────────────────────────────────────────────────────

const RECT_SHADER = /* wgsl */`
struct Globals {
  viewport: vec2f,
}

struct Quad {
  // position + size in logical pixels
  pos:      vec2f,
  size:     vec2f,
  // uv rect inside the atlas / texture (0..1)
  uvPos:    vec2f,
  uvSize:   vec2f,
  // colour tint (premultiplied RGBA 0..1)
  color:    vec4f,
  // per-quad flags and parameters packed into one vec4
  // x: corner radius (px), y: border width (px),
  // z: mode (0=filled rect, 1=sdf glyph, 2=texture window)
  // w: opacity (for window fade)
  params:   vec4f,
  // border colour
  borderColor: vec4f,
  // clip rect (x,y,w,h) in logical pixels; all zeros = no clip
  clip:     vec4f,
}

@group(0) @binding(0) var<uniform>        globals:    Globals;
@group(0) @binding(1) var<storage, read>  quads:      array<Quad>;
@group(1) @binding(0) var                 sdfSampler: sampler;
@group(1) @binding(1) var                 sdfAtlas:   texture_2d<f32>;

struct VsOut {
  @builtin(position) pos:    vec4f,
  @location(0)       uv:     vec2f,
  @location(1)       color:  vec4f,
  @location(2)       params: vec4f,
  @location(3)       border: vec4f,
  @location(4)       pxPos:  vec2f,   // logical-px position of fragment
  @location(5)       qpos:   vec2f,   // quad origin in logical px
  @location(6)       qsize:  vec2f,   // quad size in logical px
  @location(7)       clip:   vec4f,
}

// Emit two triangles (6 vertices) for each quad instance
@vertex
fn vs_main(
  @builtin(instance_index) inst: u32,
  @builtin(vertex_index)   vert: u32,
) -> VsOut {
  let q = quads[inst];

  // Unit quad corners (CCW)
  let corners = array<vec2f, 6>(
    vec2f(0, 0), vec2f(1, 0), vec2f(0, 1),
    vec2f(1, 0), vec2f(1, 1), vec2f(0, 1),
  );
  let c = corners[vert];

  let pxPos = q.pos + c * q.size;

  // Convert logical pixels → NDC  (Y flipped: top-left is (-1, 1))
  let ndc = vec2f(
     pxPos.x / globals.viewport.x * 2.0 - 1.0,
    -pxPos.y / globals.viewport.y * 2.0 + 1.0,
  );

  var out: VsOut;
  out.pos    = vec4f(ndc, 0.0, 1.0);
  out.uv     = q.uvPos + c * q.uvSize;
  out.color  = q.color;
  out.params = q.params;
  out.border = q.borderColor;
  out.pxPos  = pxPos;
  out.qpos   = q.pos;
  out.qsize  = q.size;
  out.clip   = q.clip;
  return out;
}

// Smooth-step SDF for rounded-rect
fn sdRoundedRect(p: vec2f, halfSize: vec2f, r: f32) -> f32 {
  let q = abs(p) - halfSize + vec2f(r);
  return length(max(q, vec2f(0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  // Always sample at level 0 and compute derivatives in uniform control flow
  // to avoid issues with non-uniform control flow inside branches/after discards.
  let atlasSample = textureSampleLevel(sdfAtlas, sdfSampler, in.uv, 0.0);
  let msd         = max(min(atlasSample.r, atlasSample.g), min(max(atlasSample.r, atlasSample.g), atlasSample.b));
  let pw          = length(vec2f(dpdx(msd), dpdy(msd))) * 0.7071;

  let mode    = in.params.z;
  let radius  = in.params.x;
  let bw      = in.params.y;
  let opacity = in.params.w;

  // Clip rectangle discard
  let cl = in.clip;
  if (cl.z > 0.0 || cl.w > 0.0) {
    if (in.pxPos.x < cl.x || in.pxPos.x > cl.x + cl.z ||
        in.pxPos.y < cl.y || in.pxPos.y > cl.y + cl.w) {
      discard;
    }
  }

  // ── Mode 0: Filled / bordered rectangle ──────────────────────────────────
  if (mode < 0.5) {
    let center   = in.qpos + in.qsize * 0.5;
    let halfSize = in.qsize * 0.5;
    let p        = in.pxPos - center;
    let dist     = sdRoundedRect(p, halfSize, radius);

    // Anti-alias the outer edge
    let alpha = 1.0 - smoothstep(-0.5, 0.5, dist);
    if (alpha < 0.001) { discard; }

    // Border blend
    var col = in.color;
    if (bw > 0.0 && length(in.border.rgb) > 0.0) {
      let borderAlpha = smoothstep(-0.5, 0.5, -(dist + bw)) ;
      col = mix(in.border, in.color, borderAlpha);
    }
    return vec4f(col.rgb * col.a, col.a) * alpha * opacity;
  }

  // ── Mode 1: SDF glyph from atlas ─────────────────────────────────────────
  if (mode < 1.5) {
    // Multi-channel SDF median
    let sigDist = msd - 0.5;
    let alpha   = clamp(sigDist / max(pw, 0.0001) + 0.5, 0.0, 1.0);
    if (alpha < 0.001) { discard; }
    return vec4f(in.color.rgb * in.color.a, in.color.a) * alpha * opacity;
  }

  // ── Mode 2: Texture window (sampled from window texture slot) ─────────────
  return atlasSample * opacity;
}
`;

// Separate simple shader used only for compositing window textures
// (avoids dynamic indexing of texture arrays which WebGPU doesn't allow easily)
const WINDOW_BLIT_SHADER = /* wgsl */`
struct Globals { viewport: vec2f }
@group(0) @binding(0) var<uniform> globals: Globals;
@group(1) @binding(0) var          smp:     sampler;
@group(1) @binding(1) var          tex:     texture_2d<f32>;

struct Quad {
  pos:     vec2f,
  size:    vec2f,
  // corner radius, border width, opacity, _pad
  params:  vec4f,
  color:   vec4f, // border color tint
  clip:    vec4f,
}
@group(0) @binding(1) var<uniform> quad: Quad;

struct VsOut {
  @builtin(position) pos:   vec4f,
  @location(0)       uv:    vec2f,
  @location(1)       pxPos: vec2f,
  @location(2)       qpos:  vec2f,
  @location(3)       qsize: vec2f,
}

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let corners = array<vec2f,6>(
    vec2f(0,0),vec2f(1,0),vec2f(0,1),
    vec2f(1,0),vec2f(1,1),vec2f(0,1),
  );
  let c  = corners[vi];
  let px = quad.pos + c * quad.size;
  let ndc = vec2f(
     px.x / globals.viewport.x * 2.0 - 1.0,
    -px.y / globals.viewport.y * 2.0 + 1.0,
  );
  return VsOut(vec4f(ndc, 0, 1), c, px, quad.pos, quad.size);
}

fn sdRR(p: vec2f, hs: vec2f, r: f32) -> f32 {
  let q = abs(p) - hs + vec2f(r);
  return length(max(q, vec2f(0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let cl = quad.clip;
  if (cl.z > 0.0 || cl.w > 0.0) {
    if (in.pxPos.x < cl.x || in.pxPos.x > cl.x + cl.z ||
        in.pxPos.y < cl.y || in.pxPos.y > cl.y + cl.w) {
      discard;
    }
  }
  let radius  = quad.params.x;
  let opacity = quad.params.z;
  let center  = in.qpos + in.qsize * 0.5;
  let dist    = sdRR(in.pxPos - center, in.qsize * 0.5, radius);
  let alpha   = (1.0 - smoothstep(-0.5, 0.5, dist)) * opacity;
  if (alpha < 0.001) { discard; }
  let s = textureSampleLevel(tex, smp, in.uv, 0.0);
  return s * alpha;
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Quad layout in the GPU storage buffer
// Each quad = 20 f32 = 80 bytes
// ─────────────────────────────────────────────────────────────────────────────

const QUAD_FLOATS = 24; // padded to 96 bytes (multiple of 16)
const MAX_QUADS   = 16384;

/**
 * The Batcher accumulates draw calls each frame into a typed array, then
 * uploads once and issues a single indirect draw call.
 */
export class Batcher {
  private readonly data    = new Float32Array(MAX_QUADS * QUAD_FLOATS);
  private count            = 0;
  private readonly quadBuf:  GPUBuffer;
  private readonly globBuf:  GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly windowBlitPipeline: GPURenderPipeline;
  private globalsBG!: GPUBindGroup;
  private atlasBG!:   GPUBindGroup;

  /** Current clip rect. [0,0,0,0] = no clip. */
  private clipStack: [number, number, number, number][] = [[0, 0, 0, 0]];

  constructor(
    private readonly gpu: GpuContext,
    private readonly atlas: GpuAtlas,
  ) {
    const dev = gpu.device;

    this.quadBuf = dev.createBuffer({
      label: 'velui-quads',
      size:  MAX_QUADS * QUAD_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.globBuf = dev.createBuffer({
      label: 'velui-globals',
      size:  16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // ── Main rect pipeline ────────────────────────────────────────────────
    const mod = dev.createShaderModule({ label: 'velui-rect', code: RECT_SHADER });

    const bg0Layout = dev.createBindGroupLayout({
      label: 'velui-bg0',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' } },
      ],
    });
    const bg1Layout = dev.createBindGroupLayout({
      label: 'velui-bg1',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: '2d' } },
      ],
    });
    const layout = dev.createPipelineLayout({ bindGroupLayouts: [bg0Layout, bg1Layout] });

    this.pipeline = dev.createRenderPipeline({
      label:  'velui-rect-pipeline',
      layout,
      vertex:   { module: mod, entryPoint: 'vs_main' },
      fragment: {
        module:  mod,
        entryPoint: 'fs_main',
        targets: [{
          format: gpu.format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // ── Window blit pipeline ──────────────────────────────────────────────
    const blitMod  = dev.createShaderModule({ label: 'velui-blit', code: WINDOW_BLIT_SHADER });
    const blitQuadBufLayout = dev.createBindGroupLayout({
      label: 'velui-blit-bg0',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' } },
      ],
    });
    const blitTexLayout = dev.createBindGroupLayout({
      label: 'velui-blit-bg1',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: '2d' } },
      ],
    });
    this.windowBlitPipeline = dev.createRenderPipeline({
      label:  'velui-blit-pipeline',
      layout: dev.createPipelineLayout({ bindGroupLayouts: [blitQuadBufLayout, blitTexLayout] }),
      vertex:   { module: blitMod, entryPoint: 'vs' },
      fragment: {
        module: blitMod, entryPoint: 'fs',
        targets: [{
          format: gpu.format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.rebuildBindGroups();
  }

  private rebuildBindGroups() {
    const dev = this.gpu.device;
    this.globalsBG = dev.createBindGroup({
      label:  'velui-globals-bg',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.globBuf  } },
        { binding: 1, resource: { buffer: this.quadBuf  } },
      ],
    });
    this.atlasBG = dev.createBindGroup({
      label:  'velui-atlas-bg',
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: this.atlas.sampler },
        { binding: 1, resource: this.atlas.texture.createView() },
      ],
    });
  }

  // ── Clip stack ────────────────────────────────────────────────────────────

  pushClip(x: number, y: number, w: number, h: number) {
    this.clipStack.push([x, y, w, h]);
  }
  popClip() {
    if (this.clipStack.length > 1) this.clipStack.pop();
  }
  private get clip(): [number, number, number, number] {
    return this.clipStack[this.clipStack.length - 1];
  }

  // ── Draw primitives ───────────────────────────────────────────────────────

  /**
   * Push one quad.  All coords in logical pixels.
   * mode: 0 = rect/border  1 = SDF glyph  (2 = handled separately via blitWindow)
   */
  pushQuad(
    x: number, y: number, w: number, h: number,
    color: Color,
    opts: {
      radius?:      number;
      borderWidth?: number;
      borderColor?: Color;
      mode?:        0 | 1;
      uvX?: number; uvY?: number; uvW?: number; uvH?: number;
      opacity?:     number;
    } = {},
  ) {
    if (this.count >= MAX_QUADS) { console.warn('velui: quad budget exceeded'); return; }
    const i = this.count++ * QUAD_FLOATS;
    const d = this.data;
    const [cx, cy, cw, ch] = this.clip;
    const bc = opts.borderColor ?? { r: 0, g: 0, b: 0, a: 255 };
    const op = opts.opacity ?? 1;

    d[i+ 0] = x; d[i+ 1] = y; d[i+ 2] = w; d[i+ 3] = h;
    d[i+ 4] = opts.uvX ?? 0; d[i+ 5] = opts.uvY ?? 0;
    d[i+ 6] = opts.uvW ?? 0; d[i+ 7] = opts.uvH ?? 0;
    d[i+ 8] = color.r/255; d[i+ 9] = color.g/255;
    d[i+10] = color.b/255; d[i+11] = color.a/255;
    d[i+12] = opts.radius ?? 0;
    d[i+13] = opts.borderWidth ?? 0;
    d[i+14] = opts.mode ?? 0;
    d[i+15] = op;
    d[i+16] = bc.r/255; d[i+17] = bc.g/255;
    d[i+18] = bc.b/255; d[i+19] = bc.a/255;
    d[i+20] = cx; d[i+21] = cy; d[i+22] = cw; d[i+23] = ch;
  }

  /**
   * Queued window blit records — rendered in a second pass after all quads.
   */
  private readonly windowBlits: {
    x: number; y: number; w: number; h: number;
    radius: number; opacity: number; texture: GPUTexture;
    clip: [number, number, number, number];
  }[] = [];

  blitWindow(
    x: number, y: number, w: number, h: number,
    texture: GPUTexture,
    opts: { radius?: number; opacity?: number } = {},
  ) {
    this.windowBlits.push({
      x, y, w, h,
      radius:  opts.radius  ?? 0,
      opacity: opts.opacity ?? 1,
      texture,
      clip: this.clip,
    });
  }

  // ── Frame lifecycle ───────────────────────────────────────────────────────

  reset() {
    this.count = 0;
    this.windowBlits.length = 0;
    this.clipStack = [[0, 0, 0, 0]];
  }

  /**
   * Upload data and encode draw calls into `pass`.
   * Must be called between beginRenderPass / end.
   */
  flush(
    encoder: GPUCommandEncoder,
    target:  GPUTextureView,
    vpW: number, vpH: number,
    loadOp:  GPULoadOp = 'load',
  ) {
    const dev = this.gpu.device;

    // Upload globals
    dev.queue.writeBuffer(this.globBuf, 0,
      new Float32Array([vpW, vpH, 0, 0]).buffer);

    // Upload quads
    if (this.count > 0) {
      dev.queue.writeBuffer(
        this.quadBuf, 0,
        this.data.buffer, 0, this.count * QUAD_FLOATS,
      );
    }

    // ── Pass 1: all rect quads ────────────────────────────────────────────
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view:       target,
        loadOp,
        storeOp:    'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });

    if (this.count > 0) {
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.globalsBG);
      pass.setBindGroup(1, this.atlasBG);
      pass.draw(6, this.count, 0, 0);
    }

    pass.end();

    // ── Pass 2: window texture blits ──────────────────────────────────────
    for (const blit of this.windowBlits) {
      const quadData = new Float32Array([
        blit.x, blit.y, blit.w, blit.h,
        blit.radius, 0, blit.opacity, 0,
        0, 0, 0, 0,           // border color (unused)
        ...blit.clip,
      ]);
      const quadBuf = dev.createBuffer({
        size:  quadData.byteLength + (16 - quadData.byteLength % 16) % 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Float32Array(quadBuf.getMappedRange()).set(quadData);
      quadBuf.unmap();

      const bg0 = dev.createBindGroup({
        layout: this.windowBlitPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.globBuf } },
          { binding: 1, resource: { buffer: quadBuf     } },
        ],
      });
      const bg1 = dev.createBindGroup({
        layout: this.windowBlitPipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: this.gpu.createLinearSampler() },
          { binding: 1, resource: blit.texture.createView() },
        ],
      });

      const blitPass = encoder.beginRenderPass({
        colorAttachments: [{
          view:    target,
          loadOp:  'load',
          storeOp: 'store',
        }],
      });
      blitPass.setPipeline(this.windowBlitPipeline);
      blitPass.setBindGroup(0, bg0);
      blitPass.setBindGroup(1, bg1);
      blitPass.draw(6, 1, 0, 0);
      blitPass.end();

      // Queue destruction after GPU work done
      dev.queue.onSubmittedWorkDone().then(() => quadBuf.destroy());
    }
  }

  /** Notify batcher if atlas texture was replaced (e.g. after re-packing). */
  atlasUpdated() { this.rebuildBindGroups(); }

  dispose() {
    this.quadBuf.destroy();
    this.globBuf.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GpuAtlas — grows dynamically as new glyphs are rasterised
// ─────────────────────────────────────────────────────────────────────────────

export class GpuAtlas {
  texture!: GPUTexture;
  sampler:  GPUSampler;
  private size = 1024;

  constructor(private readonly gpu: GpuContext) {
    this.sampler = gpu.createLinearSampler();
    this.allocTexture();
  }

  private allocTexture() {
    this.texture?.destroy();
    this.texture = this.gpu.device.createTexture({
      label:  'velui-atlas',
      size:   [this.size, this.size, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST        |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  /** Upload an ImageBitmap (e.g. MSDF glyph) at atlas position (ax, ay). */
  upload(bitmap: ImageBitmap, ax: number, ay: number) {
    this.gpu.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: this.texture, origin: [ax, ay, 0] },
      [bitmap.width, bitmap.height],
    );
  }

  /** Upload raw RGBA bytes at atlas position. */
  uploadRaw(data: Uint8Array, w: number, h: number, ax: number, ay: number) {
    this.gpu.device.queue.writeTexture(
      { texture: this.texture, origin: [ax, ay, 0] },
      data.buffer,
      { bytesPerRow: w * 4 },
      [w, h],
    );
  }

  grow(batcher?: Batcher) {
    this.size *= 2;
    this.allocTexture();
    batcher?.atlasUpdated();
  }

  get px() { return this.size; }
}

// Re-export Color for use in shader helpers
import type { Color as ColorType } from '../types';
import { Color as C } from '../types';