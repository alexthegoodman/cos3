// ============================================================
// COS3 App SDK — UI Spec Builder
// ============================================================
//
// Tiny fluent API to construct UINode trees from TypeScript.
// Apps running inside QuickJS build the same JSON structure and
// pass it to COS3.ui.render(JSON.stringify(tree)).
//
// The Konva / WebGPU renderer that *consumes* these trees lives
// in the host GUI layer (outside this SDK) — see placeholder below.
// ============================================================

import type { UINode, UINodeType } from "./types";

// ---- Builder ----

class UINodeBuilder {
  private node: UINode;

  constructor(type: UINodeType, props?: Record<string, unknown>) {
    this.node = { type, props: props ?? {} };
  }

  id(id: string): this {
    this.node.id = id;
    return this;
  }

  prop(key: string, value: unknown): this {
    this.node.props = { ...this.node.props, [key]: value };
    return this;
  }

  on(event: string, handlerName: string): this {
    this.node.on = { ...this.node.on, [event]: handlerName };
    return this;
  }

  children(...children: (UINode | UINodeBuilder)[]): this {
    this.node.children = children.map((c) =>
      c instanceof UINodeBuilder ? c.build() : c
    );
    return this;
  }

  build(): UINode {
    return this.node;
  }
}

// ---- Factory helpers ----

export function Window(
  title: string,
  opts?: { width?: number; height?: number; resizable?: boolean }
): UINodeBuilder {
  return new UINodeBuilder("window", { title, ...opts });
}

export function Container(
  opts?: {
    layout?: "row" | "column" | "grid";
    gap?: number;
    padding?: number;
    align?: string;
    justify?: string;
  }
): UINodeBuilder {
  return new UINodeBuilder("container", opts ?? {});
}

export function Text(
  content: string,
  opts?: { size?: number; weight?: "normal" | "bold"; color?: string; wrap?: boolean }
): UINodeBuilder {
  return new UINodeBuilder("text", { content, ...opts });
}

export function Input(opts?: {
  placeholder?: string;
  value?: string;
  type?: "text" | "number" | "password";
  onChange?: string;
}): UINodeBuilder {
  return new UINodeBuilder("input", opts ?? {});
}

export function Textarea(opts?: {
  placeholder?: string;
  value?: string;
  rows?: number;
  onChange?: string;
}): UINodeBuilder {
  return new UINodeBuilder("textarea", opts ?? {});
}

export function Image(src: string, opts?: { width?: number; height?: number; alt?: string }): UINodeBuilder {
  return new UINodeBuilder("image", { src, ...opts });
}

export function Tabs(...tabs: UINodeBuilder[]): UINodeBuilder {
  return new UINodeBuilder("tabs").children(...tabs);
}

export function Tab(label: string, ...children: (UINode | UINodeBuilder)[]): UINodeBuilder {
  return new UINodeBuilder("tab", { label }).children(...children);
}

export function Dropdown(opts: {
  options: { value: string; label: string }[];
  value?: string;
  onChange?: string;
}): UINodeBuilder {
  return new UINodeBuilder("dropdown", opts);
}

export function Button(
  label: string,
  opts?: { onClick?: string; disabled?: boolean; variant?: "primary" | "secondary" | "ghost" }
): UINodeBuilder {
  return new UINodeBuilder("button", { label, ...opts });
}

/** Named injection point — the host renderer can slot content from other apps here */
export function Slot(name: string): UINodeBuilder {
  return new UINodeBuilder("slot", { name });
}

// ---- Serialise for QuickJS ----

export function serializeUITree(root: UINode | UINodeBuilder): string {
  const node = root instanceof UINodeBuilder ? root.build() : root;
  return JSON.stringify(node);
}

// ---- Script snippet injected into QuickJS VMs ----
// This is the minimal client-side UI API available inside a sandboxed app script.
// The host calls COS3.ui.render() with the JSON string this produces.

export const GUEST_UI_SCRIPT = /* js */ `
(function() {
  const h = (type, props, ...children) => {
    const node = { type };
    if (props && Object.keys(props).length) node.props = props;
    const flat = children.flat(Infinity).filter(Boolean);
    if (flat.length) node.children = flat;
    return node;
  };

  const COS3UI = {
    Window:    (props, ...c) => h('window', props, ...c),
    Container: (props, ...c) => h('container', props, ...c),
    Text:      (props)       => h('text', props),
    Input:     (props)       => h('input', props),
    Textarea:  (props)       => h('textarea', props),
    Image:     (src, props)  => h('image', { src, ...props }),
    Tabs:      (...c)        => h('tabs', {}, ...c),
    Tab:       (label, ...c) => h('tab', { label }, ...c),
    Dropdown:  (props)       => h('dropdown', props),
    Button:    (label, props)=> h('button', { label, ...props }),
    Slot:      (name)        => h('slot', { name }),
    render:    (node)        => COS3.ui.render(JSON.stringify(node)),
  };

  globalThis.UI = COS3UI;
})();
`;