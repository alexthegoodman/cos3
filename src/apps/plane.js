// Grid World App — Function-Based Renderer
const { UI, COS3 } = globalThis;

const vertexShader = `
  struct Uni { mvp: mat4x4f }
  @group(0) @binding(0) var<uniform> uni: Uni;
  struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
  @vertex fn vs(@location(0) pos: vec3f) -> VsOut {
    return VsOut(uni.mvp * vec4f(pos, 1.0), pos.xz * 0.5 + 0.5);
  }
`;

const fragmentShader = `
  struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
  @fragment fn fs(in: VsOut) -> @location(0) vec4f {
    let grid = floor(in.uv * 10.0);
    let check = (grid.x + grid.y) % 2.0;
    let col = select(vec3f(0.2), vec3f(0.8), check > 0.5);
    return vec4f(col, 1.0);
  }
`;

const meshId = COS3.graphics.createMesh({
  vertices: [
    -1, 0, -1,  1, 0, -1,  1, 0,  1,
    -1, 0, -1,  1, 0,  1, -1, 0,  1,
  ]
});

const pipelineId = COS3.graphics.createPipeline({
  vertexShader, fragmentShader,
  bindings: [{ group: 0, binding: 0, type: 'uniform', resource: 'mvp' }]
});

const mvpId = COS3.graphics.createBuffer({ size: 64, usage: 64 });

COS3.interop.registerRenderer('grid-renderer', 'onRender', 'webgpu');

globalThis.onRender = (pass, params) => {
  pass.setPipeline(pipelineId);
  pass.setMesh(meshId);
  pass.setBuffer('mvp', mvpId);
  pass.draw();
};

UI.render(
  UI.Window({ title: 'SDK Grid' },
    UI.Container({ layout: 'column', gap: 10 },
      UI.Text({ content: 'Shared Grid Function', size: 16 }),
      UI.Image('gpu-scene', { renderer: 'plane.app::grid-renderer' })
    )
  )
);
