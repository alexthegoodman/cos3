// Pyramid Power App — SDK-Driven
const { UI, COS3 } = globalThis;

COS3.interop.registerRenderer('pyramid-viz', 'webgpu');

UI.render(
  UI.Window({ title: 'Pyramid Power' },
    UI.Container({ layout: 'column', gap: 10 },
      UI.Text({ content: 'Mystical geometric shapes.', size: 18 }),
      UI.Image('gpu-scene', { renderer: 'pyramid-viz' })
    )
  )
);
