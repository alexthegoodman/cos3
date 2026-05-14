// Star Field App — Function-Based Renderer
const { UI, COS3 } = globalThis;

const vertexShader = `
  struct Uni { mvp: mat4x4f }
  @group(0) @binding(0) var<uniform> uni: Uni;
  struct VsOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }
  @vertex fn vs(@location(0) pos: vec3f) -> VsOut {
    return VsOut(uni.mvp * vec4f(pos, 1.0), vec3f(0.5 + pos.x * 0.5, 0.5 + pos.y * 0.5, 0.5 + pos.z * 0.5));
  }
`;

const fragmentShader = `
  struct VsOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }
  @fragment fn fs(in: VsOut) -> @location(0) vec4f { return vec4f(in.col, 1.0); }
`;

const particles = [];
for (let i = 0; i < 1000; i++) {
  particles.push((Math.random() - 0.5) * 2);
  particles.push((Math.random() - 0.5) * 2);
  particles.push((Math.random() - 0.5) * 2);
}

const meshId = COS3.graphics.createMesh({
  vertices: particles,
  topology: 'point-list'
});

const pipelineId = COS3.graphics.createPipeline({
  vertexShader, fragmentShader,
  bindings: [{ group: 0, binding: 0, type: 'uniform', resource: 'mvp' }]
});

const mvpId = COS3.graphics.createBuffer({ size: 64, usage: 64 });

COS3.interop.registerRenderer('star-renderer', 'onRender', 'webgpu');

globalThis.onRender = (pass, params) => {
  pass.setPipeline(pipelineId);
  pass.setMesh(meshId);
  pass.setBuffer('mvp', mvpId);
  pass.draw();
};

UI.render(
  UI.Window({ title: 'SDK Stars' },
    UI.Container({ layout: 'column', gap: 10 },
      UI.Text({ content: 'Dynamic SDK Particles', size: 16 }),
      UI.Image('gpu-scene', { renderer: 'particles.app::star-renderer' })
    )
  )
);
