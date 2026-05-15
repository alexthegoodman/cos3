const { UI, COS3 } = globalThis;

let display = '0';
let equation = '';
let lastAnswer = '';

function renderUI() {
  UI.render(
    UI.Window({ title: 'Calculator', width: 320, height: 480 },
      UI.Container({ layout: 'column', padding: 20, gap: 15 },
        // Display Area
        UI.Container({ height: 80, padding: 10 },
          UI.Text({ content: equation, size: 16, color: '#aaa', align: 'right' }),
          UI.Text({ content: display, size: 42, weight: 'bold', align: 'right' })
        ),
        
        // Keypad Grid
        UI.Container({ layout: 'grid', cols: 4, gap: 10, height: 300 },
          // Row 1
          UI.Button('C', { onClick: 'onClear', height: 60 }),
          UI.Button('(', { onClick: 'onOpenParen', height: 60 }),
          UI.Button(')', { onClick: 'onCloseParen', height: 60 }),
          UI.Button('/', { onClick: 'onOpDivide', height: 60 }),
          
          // Row 2
          UI.Button('7', { onClick: 'onDigit7', height: 60 }),
          UI.Button('8', { onClick: 'onDigit8', height: 60 }),
          UI.Button('9', { onClick: 'onDigit9', height: 60 }),
          UI.Button('*', { onClick: 'onOpMultiply', height: 60 }),
          
          // Row 3
          UI.Button('4', { onClick: 'onDigit4', height: 60 }),
          UI.Button('5', { onClick: 'onDigit5', height: 60 }),
          UI.Button('6', { onClick: 'onDigit6', height: 60 }),
          UI.Button('-', { onClick: 'onOpSubtract', height: 60 }),
          
          // Row 4
          UI.Button('1', { onClick: 'onDigit1', height: 60 }),
          UI.Button('2', { onClick: 'onDigit2', height: 60 }),
          UI.Button('3', { onClick: 'onDigit3', height: 60 }),
          UI.Button('+', { onClick: 'onOpAdd', height: 60 }),
          
          // Row 5
          UI.Button('0', { onClick: 'onDigit0', height: 60 }),
          UI.Button('.', { onClick: 'onDot', height: 60 }),
          UI.Button('DEL', { onClick: 'onDelete', height: 60 }),
          UI.Button('=', { onClick: 'onEqual', height: 60 })
        )
      )
    )
  );
}

// ---- Event Handlers ----

function appendDigit(d) {
  if (display === '0' || display === 'Error') {
    display = d;
  } else {
    display += d;
  }
  renderUI();
}

function appendOp(op) {
  if (display === 'Error') return;
  equation += display + ' ' + op + ' ';
  display = '0';
  renderUI();
}

globalThis.onDigit0 = () => appendDigit('0');
globalThis.onDigit1 = () => appendDigit('1');
globalThis.onDigit2 = () => appendDigit('2');
globalThis.onDigit3 = () => appendDigit('3');
globalThis.onDigit4 = () => appendDigit('4');
globalThis.onDigit5 = () => appendDigit('5');
globalThis.onDigit6 = () => appendDigit('6');
globalThis.onDigit7 = () => appendDigit('7');
globalThis.onDigit8 = () => appendDigit('8');
globalThis.onDigit9 = () => appendDigit('9');
globalThis.onDot = () => {
  if (!display.includes('.')) appendDigit('.');
};

globalThis.onOpAdd = () => appendOp('+');
globalThis.onOpSubtract = () => appendOp('-');
globalThis.onOpMultiply = () => appendOp('*');
globalThis.onOpDivide = () => appendOp('/');
globalThis.onOpenParen = () => appendDigit('(');
globalThis.onCloseParen = () => appendDigit(')');

globalThis.onClear = () => {
  display = '0';
  equation = '';
  renderUI();
};

globalThis.onDelete = () => {
  if (display.length > 1) {
    display = display.slice(0, -1);
  } else {
    display = '0';
  }
  renderUI();
};

globalThis.onEqual = () => {
  try {
    const fullEq = equation + display;
    // Use the newly exposed COS3.math.evaluate for accurate arithmetic
    const result = COS3.math.evaluate(fullEq);
    
    if (result.startsWith('error:')) {
      display = 'Error';
    } else {
      lastAnswer = result;
      display = lastAnswer;
      equation = '';
    }
  } catch (e) {
    display = 'Error';
  }
  renderUI();
};

renderUI();
