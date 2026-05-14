// Pyramid Power App — Fully SDK-Driven
const { UI, COS3 } = globalThis;

const vertexShader = `
  struct Uni { mvp: mat4x4f }
  @group(0) @binding(0) var<uniform> uni: Uni;
  struct VsOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }
  @vertex fn vs(@location(0) pos: vec3f, @builtin(vertex_index) vi: u32) -> VsOut {
    let cols = array<vec3f, 6>(vec3f(0.3,0.6,0.9), vec3f(0.3,0.6,0.9), vec3f(0.9,0.5,0.2), vec3f(0.8,0.4,0.1), vec3f(0.7,0.3,0.1), vec3f(0.6,0.2,0.1));
    return VsOut(uni.mvp * vec4f(pos, 1.0), cols[vi / 3u]);
  }
`;

const fragmentShader = `
  struct VsOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }
  @fragment fn fs(in: VsOut) -> @location(0) vec4f { return vec4f(in.col, 1.0); }
`;

const meshId = COS3.graphics.createMesh({
  vertices: new Float32Array([
    // Base
    -1,-1,-1,  1,-1, 1,  1,-1,-1,
    -1,-1,-1, -1,-1, 1,  1,-1, 1,
    // Sides
     0, 1, 0,  1,-1, 1, -1,-1, 1, // front
     0, 1, 0,  1,-1,-1,  1,-1, 1, // right
     0, 1, 0, -1,-1,-1,  1,-1,-1, // back
     0, 1, 0, -1,-1, 1, -1,-1,-1, // left
  ])
});

const pipelineId = COS3.graphics.createPipeline({
  vertexShader, fragmentShader,
  bindings: [{ group: 0, binding: 0, type: 'uniform', resource: 'mvp' }]
});

const mvpId = COS3.graphics.createBuffer({ size: 64, usage: 64 });

COS3.interop.registerRenderer('pyramid-renderer', 'webgpu');

UI.render(
  UI.Window({ title: 'SDK Pyramid' },
    UI.Container({ layout: 'column', gap: 10 },
      UI.Text({ content: 'Autonomous Pyramid Render', size: 16 }),
      UI.Image('gpu-scene', { renderer: 'pyramid-renderer', pipeline: pipelineId, mesh: meshId, mvp: mvpId })
    )
  )
);
