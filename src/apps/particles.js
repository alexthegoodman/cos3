// Star Field App — SDK-Driven
const { UI, COS3 } = globalThis;

COS3.interop.registerRenderer('star-field', 'webgpu');

UI.render(
  UI.Window({ title: 'Star Field' },
    UI.Container({ layout: 'column', gap: 10 },
      UI.Text({ content: 'Simulating 1,000 particles.', size: 18 }),
      UI.Image('gpu-scene', { renderer: 'star-field' })
    )
  )
);
