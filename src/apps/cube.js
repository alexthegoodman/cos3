// Cube Viewer App — Fully SDK-Driven
const { UI, COS3 } = globalThis;

const vertexShader = `
  struct Uni { mvp: mat4x4f }
  @group(0) @binding(0) var<uniform> uni: Uni;
  struct VsOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }
  @vertex fn vs(@location(0) pos: vec3f, @builtin(vertex_index) vi: u32) -> VsOut {
    let cols = array<vec3f, 6>(vec3f(0.9,0.3,0.3), vec3f(0.3,0.9,0.3), vec3f(0.3,0.4,0.9), vec3f(0.9,0.9,0.3), vec3f(0.3,0.9,0.9), vec3f(0.9,0.3,0.9));
    return VsOut(uni.mvp * vec4f(pos, 1.0), cols[vi / 6u]);
  }
`;

const fragmentShader = `
  struct VsOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }
  @fragment fn fs(in: VsOut) -> @location(0) vec4f { return vec4f(in.col, 1.0); }
`;

// Initialize Resources using plain arrays for reliable marshaling
const meshId = COS3.graphics.createMesh({
  vertices: [
    -1,-1, 1,  1,-1, 1,  1, 1, 1,  1, 1, 1, -1, 1, 1, -1,-1, 1,
    -1,-1,-1, -1, 1,-1,  1, 1,-1,  1, 1,-1,  1,-1,-1, -1,-1,-1,
    -1, 1, 1,  1, 1, 1,  1, 1,-1,  1, 1,-1, -1, 1,-1, -1, 1, 1,
    -1,-1,-1,  1,-1,-1,  1,-1, 1,  1,-1, 1, -1,-1, 1, -1,-1,-1,
     1,-1, 1,  1,-1,-1,  1, 1,-1,  1, 1,-1,  1, 1, 1,  1,-1, 1,
    -1,-1,-1, -1,-1, 1, -1, 1, 1, -1, 1, 1, -1, 1,-1, -1,-1,-1,
  ]
});

const pipelineId = COS3.graphics.createPipeline({
  vertexShader,
  fragmentShader,
  bindings: [{ group: 0, binding: 0, type: 'uniform', resource: 'mvp' }]
});

const mvpId = COS3.graphics.createBuffer({ size: 64, usage: 64 });

COS3.interop.registerRenderer('cube-renderer', 'webgpu');

let rotations = 0;

function render() {
  UI.render(
    UI.Window({ title: 'SDK Cube', width: 400, height: 480 },
      UI.Container({ layout: 'column', gap: 10 },
        UI.Text({ content: 'Shaders defined in-app!', size: 16 }),
        UI.Image('gpu-scene', { renderer: 'cube-renderer', pipeline: pipelineId, mesh: meshId, mvp: mvpId }),
        UI.Button('Interactions: ' + rotations, { onClick: 'onBtnClick' })
      )
    )
  );
}

globalThis.onBtnClick = () => {
  rotations++;
  render();
};

render();
