// Cube Viewer App — Function-Based Renderer
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

// // 1. Initialize Resources
const pipelineId = COS3.graphics.createPipeline({
  vertexShader, fragmentShader,
  bindings: [{ group: 0, binding: 0, type: 'uniform', resource: 'mvp' }]
});

console.log('pipelineId:', pipelineId);

const mvpId = COS3.graphics.createBuffer({ size: 64, usage: 64 });

console.log('mvpId:', mvpId);

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

console.log('meshId:', meshId);

// 2. Register Shared Renderer Function
COS3.interop.registerRenderer('cube-renderer', 'onRender', 'webgpu');

// This function is called by the host every frame
globalThis.onRender = (pass, params) => {
  pass.setPipeline(pipelineId);
  pass.setMesh(meshId);
  pass.setBuffer('mvp', mvpId);
  pass.draw();
};

let rotations = 0;

function renderUI() {
  COS3.ui.render(
    COS3.ui.Window({ title: 'SDK Cube' },
      COS3.ui.Container({ layout: 'column', gap: 10 },
        COS3.ui.Text({ content: 'Dynamic Renderer Function!', size: 16 }),
        COS3.ui.Image('gpu-scene', { renderer: 'cube.app::cube-renderer' }),
        COS3.ui.Button('Interactions: ' + rotations, { onClick: 'onBtnClick' })
      )
    )
  );
}

// globalThis.onBtnClick = () => {
//   rotations++;
//   renderUI();
// };

renderUI();
