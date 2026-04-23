import { mat4 } from 'gl-matrix';

/**
 * Shared 3D Scene Primitives for VelUI Demos
 */

export interface Scene {
  init(device: GPUDevice, format: GPUTextureFormat): Promise<void>;
  renderTo(device: GPUDevice, queue: GPUQueue, target: GPUTexture | GPUCanvasContext, t: number): void;
}

export class CubeScene implements Scene {
  pipeline!: GPURenderPipeline;
  uniformBuf!: GPUBuffer;
  depthTex!:   GPUTexture;
  bindGroup!:  GPUBindGroup;
  ready = false;

  async init(device: GPUDevice, format: GPUTextureFormat) {
    const shader = /* wgsl */`
      struct Uni { mvp: mat4x4f }
      @group(0) @binding(0) var<uniform> uni: Uni;

      struct VsOut {
        @builtin(position) pos: vec4f,
        @location(0) col: vec3f,
      }

      const verts = array<vec3f, 36>(
        vec3f(-1,-1, 1), vec3f( 1,-1, 1), vec3f( 1, 1, 1),
        vec3f(-1,-1, 1), vec3f( 1, 1, 1), vec3f(-1, 1, 1),
        vec3f( 1,-1,-1), vec3f(-1,-1,-1), vec3f(-1, 1,-1),
        vec3f( 1,-1,-1), vec3f(-1, 1,-1), vec3f( 1, 1,-1),
        vec3f(-1,-1,-1), vec3f(-1,-1, 1), vec3f(-1, 1, 1),
        vec3f(-1,-1,-1), vec3f(-1, 1, 1), vec3f(-1, 1,-1),
        vec3f( 1,-1, 1), vec3f( 1,-1,-1), vec3f( 1, 1,-1),
        vec3f( 1,-1, 1), vec3f( 1, 1,-1), vec3f( 1, 1, 1),
        vec3f(-1, 1, 1), vec3f( 1, 1, 1), vec3f( 1, 1,-1),
        vec3f(-1, 1, 1), vec3f( 1, 1,-1), vec3f(-1, 1,-1),
        vec3f( 1,-1, 1), vec3f(-1,-1, 1), vec3f(-1,-1,-1),
        vec3f( 1,-1, 1), vec3f(-1,-1,-1), vec3f( 1,-1,-1),
      );
      const cols = array<vec3f, 6>(
        vec3f(0.9,0.3,0.3), vec3f(0.3,0.9,0.3), vec3f(0.3,0.4,0.9),
        vec3f(0.9,0.9,0.3), vec3f(0.3,0.9,0.9), vec3f(0.9,0.3,0.9),
      );

      @vertex fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
        let face = vi / 6u;
        return VsOut(uni.mvp * vec4f(verts[vi], 1.0), cols[face]);
      }
      @fragment fn fs(in: VsOut) -> @location(0) vec4f {
        return vec4f(in.col, 1.0);
      }
    `;

    this.createResources(device, format, shader, 36);
  }

  protected createResources(device: GPUDevice, format: GPUTextureFormat, shader: string, count: number) {
    const mod = device.createShaderModule({ code: shader });
    const bgl = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex:   { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
    });

    this.uniformBuf = device.createBuffer({
      size:  64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }],
    });
    this.ready = true;
  }

  renderTo(device: GPUDevice, queue: GPUQueue, target: GPUTexture | GPUCanvasContext | any, t: number) {
    if (!this.ready) return;

    let w = 0, h = 0;

    if (target.canvas) {
      const canvas = (target as GPUCanvasContext).canvas as OffscreenCanvas;
      w = canvas.width, h = canvas.height;
    } else {
      w = (target as GPUTexture).width, h = (target as GPUTexture).height;    
    }

    // console.info("w h", w, h, target)

    if (!this.depthTex || this.depthTex.width !== w || this.depthTex.height !== h) {
      this.depthTex?.destroy();
      this.depthTex = device.createTexture({
        size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    const aspect = w / h;
    const mvp    = buildMVP(t, aspect);
    queue.writeBuffer(this.uniformBuf, 0, mvp.buffer);

    const enc  = device.createCommandEncoder();

    let colorView = null;
    if (target.canvas) {
      colorView = target.getCurrentTexture().createView();
    } else {
      colorView = target.createView(); 
    }

    if (colorView) {
      const pass = enc.beginRenderPass({
        colorAttachments: [{
          view:       colorView,
          loadOp:     'clear',
          storeOp:    'store',
          clearValue: { r: 0.07, g: 0.07, b: 0.1, a: 1 },
        }],
        depthStencilAttachment: {
          view:              this.depthTex.createView(),
          depthLoadOp:       'clear',
          depthStoreOp:      'store',
          depthClearValue:   1,
        },
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      this.draw(pass);
      pass.end();
      queue.submit([enc.finish()]);
    }
  }

  protected draw(pass: GPURenderPassEncoder) {
    pass.draw(36);
  }
}

export class PyramidScene extends CubeScene {
  async init(device: GPUDevice, format: GPUTextureFormat) {
    const shader = /* wgsl */`
      struct Uni { mvp: mat4x4f }
      @group(0) @binding(0) var<uniform> uni: Uni;

      struct VsOut {
        @builtin(position) pos: vec4f,
        @location(0) col: vec3f,
      }

      const verts = array<vec3f, 18>(
        // Base
        vec3f(-1,-1,-1), vec3f( 1,-1, 1), vec3f( 1,-1,-1),
        vec3f(-1,-1,-1), vec3f(-1,-1, 1), vec3f( 1,-1, 1),
        // Sides
        vec3f( 0, 1, 0), vec3f( 1,-1, 1), vec3f(-1,-1, 1), // front
        vec3f( 0, 1, 0), vec3f( 1,-1,-1), vec3f( 1,-1, 1), // right
        vec3f( 0, 1, 0), vec3f(-1,-1,-1), vec3f( 1,-1,-1), // back
        vec3f( 0, 1, 0), vec3f(-1,-1, 1), vec3f(-1,-1,-1), // left
      );
      const cols = array<vec3f, 6>(
        vec3f(0.3,0.6,0.9), vec3f(0.3,0.6,0.9),
        vec3f(0.9,0.5,0.2), vec3f(0.8,0.4,0.1),
        vec3f(0.7,0.3,0.1), vec3f(0.6,0.2,0.1),
      );

      @vertex fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
        let face = vi / 3u;
        return VsOut(uni.mvp * vec4f(verts[vi], 1.0), cols[face]);
      }
      @fragment fn fs(in: VsOut) -> @location(0) vec4f {
        return vec4f(in.col, 1.0);
      }
    `;
    this.createResources(device, format, shader, 18);
  }

  protected override draw(pass: GPURenderPassEncoder) {
    pass.draw(18);
  }
}

export class PlaneScene extends CubeScene {
  async init(device: GPUDevice, format: GPUTextureFormat) {
    const shader = /* wgsl */`
      struct Uni { mvp: mat4x4f }
      @group(0) @binding(0) var<uniform> uni: Uni;

      struct VsOut {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      const verts = array<vec3f, 6>(
        vec3f(-1, 0, -1), vec3f( 1, 0, -1), vec3f( 1, 0,  1),
        vec3f(-1, 0, -1), vec3f( 1, 0,  1), vec3f(-1, 0,  1),
      );

      @vertex fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
        let p = verts[vi];
        return VsOut(uni.mvp * vec4f(p, 1.0), p.xz * 0.5 + 0.5);
      }
      @fragment fn fs(in: VsOut) -> @location(0) vec4f {
        let grid = floor(in.uv * 10.0);
        let check = (grid.x + grid.y) % 2.0;
        let col = select(vec3f(0.2), vec3f(0.8), check > 0.5);
        return vec4f(col, 1.0);
      }
    `;
    this.createResources(device, format, shader, 6);
  }

  protected override draw(pass: GPURenderPassEncoder) {
    pass.draw(6);
  }
}

export class ParticleScene extends CubeScene {
  private particleBuf!: GPUBuffer;

  async init(device: GPUDevice, format: GPUTextureFormat) {
    const shader = /* wgsl */`
      struct Uni { mvp: mat4x4f }
      @group(0) @binding(0) var<uniform> uni: Uni;

      struct VsOut {
        @builtin(position) pos: vec4f,
        @location(0) col: vec3f,
      }

      @vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) pos: vec3f) -> VsOut {
        return VsOut(uni.mvp * vec4f(pos, 1.0), vec3f(0.5 + pos.x * 0.5, 0.5 + pos.y * 0.5, 0.5 + pos.z * 0.5));
      }
      @fragment fn fs(in: VsOut) -> @location(0) vec4f {
        return vec4f(in.col, 1.0);
      }
    `;

    const mod = device.createShaderModule({ code: shader });
    const bgl = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex:   { 
        module: mod, 
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 12,
          attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 0 }]
        }]
      },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { topology: 'point-list' },
    });

    this.uniformBuf = device.createBuffer({
      size:  64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }],
    });

    const particles = new Float32Array(1000 * 3);
    for (let i = 0; i < 1000; i++) {
      particles[i * 3 + 0] = (Math.random() - 0.5) * 2;
      particles[i * 3 + 1] = (Math.random() - 0.5) * 2;
      particles[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    this.particleBuf = device.createBuffer({
      size: particles.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.particleBuf.getMappedRange()).set(particles);
    this.particleBuf.unmap();

    this.ready = true;
  }

  protected override draw(pass: GPURenderPassEncoder) {
    pass.setVertexBuffer(0, this.particleBuf);
    pass.draw(1000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMVP(t: number, aspect: number): Float32Array {
  const projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, Math.PI / 4, aspect, 0.1, 100.0);

  const viewMatrix = mat4.create();
  mat4.lookAt(viewMatrix, [0, 2, 5], [0, 0, 0], [0, 1, 0]);

  const modelMatrix = mat4.create();
  mat4.rotate(modelMatrix, modelMatrix, t * 0.7, [0, 1, 0]);
  mat4.rotate(modelMatrix, modelMatrix, t * 0.4, [1, 0, 0]);

  const mvpMatrix = mat4.create();
  mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);
  mat4.multiply(mvpMatrix, mvpMatrix, modelMatrix);

  return mvpMatrix as Float32Array;
}
