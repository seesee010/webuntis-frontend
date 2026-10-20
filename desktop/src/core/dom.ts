// Minimal DOM helpers. h() creates elements declaratively:
//   h("button", { class: "btn", onclick: () => go() }, "Refresh")

export type Child = Node | string | number | null | undefined | false | Child[];

type Props = {
  class?: string | (string | false | null | undefined)[];
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | boolean | undefined>;
  html?: string;
} & { [K in `on${string}`]?: (ev: never) => void } & Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el: HTMLElement, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === "class") {
      el.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : String(value);
    } else if (key === "style") {
      for (const [k, v] of Object.entries(value as Record<string, string>)) {
        if (k.startsWith("--")) el.style.setProperty(k, v);
        else (el.style as unknown as Record<string, string>)[k] = v;
      }
    } else if (key === "dataset") {
      Object.assign(el.dataset, value);
    } else if (key === "attrs") {
      for (const [k, v] of Object.entries(value as Record<string, string | boolean | undefined>)) {
        if (v === false || v === undefined) continue;
        el.setAttribute(k, v === true ? "" : v);
      }
    } else if (key === "html") {
      el.innerHTML = String(value);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else {
      (el as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

/** Replaces all children of el. */
export function replace(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

/** Creates an SVG element from markup (used for icons). */
export function svg(markup: string): SVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGElement;
}
