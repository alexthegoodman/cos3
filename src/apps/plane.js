// Grid World App — SDK-Driven
const { UI, COS3 } = globalThis;

COS3.interop.registerRenderer('grid-viz', 'webgpu');

UI.render(
  UI.Window({ title: 'Grid World' },
    UI.Container({ layout: 'column', gap: 10 },
      UI.Text({ content: 'Infinite checkerboard.', size: 18 }),
      UI.Image('gpu-scene', { renderer: 'grid-viz' })
    )
  )
);
