import { h, type Child } from "@/core/dom";
import { icon } from "@/core/icons";

/** Opens a modal dialog; resolves when it closes. */
export function openDialog(title: Child, body: Child, opts: { wide?: boolean } = {}): Promise<void> {
  const dlg = h(
    "dialog",
    { class: ["dialog", opts.wide && "wide"] },
    h(
      "div",
      { class: "dialog-head" },
      h("div", { class: "dialog-title" }, title),
      h("button", { class: "icon-btn", attrs: { "aria-label": "Close" }, onclick: () => dlg.close() }, icon("close")),
    ),
    h("div", { class: "dialog-body" }, body),
  );
  // Clicking the backdrop closes the dialog.
  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg) dlg.close();
  });
  document.body.appendChild(dlg);
  dlg.showModal();
  return new Promise((resolve) =>
    dlg.addEventListener("close", () => {
      dlg.remove();
      resolve();
    }),
  );
}
