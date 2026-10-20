import { describe, expect, it, vi } from "vitest";
import { h, replace } from "./dom";
import { icon } from "./icons";
import { openDialog } from "@/ui/dialog";

describe("h", () => {
  it("sets classes, styles, data, attributes, events and children", () => {
    const click = vi.fn();
    const el = h(
      "button",
      { class: ["a", false, "b"], style: { color: "red", "--c": "blue" }, dataset: { id: "1" }, attrs: { "aria-label": "x", hidden: false }, onclick: click },
      "text", null, [h("span", null, 1)],
    );
    el.click();
    expect(el.className).toBe("a b");
    expect(el.style.color).toBe("red");
    expect(el.style.getPropertyValue("--c")).toBe("blue");
    expect(el.dataset.id).toBe("1");
    expect(el.getAttribute("aria-label")).toBe("x");
    expect(el.hasAttribute("hidden")).toBe(false);
    expect(el.textContent).toBe("text1");
    expect(click).toHaveBeenCalled();
    replace(el, "new");
    expect(el.textContent).toBe("new");
  });

  it("builds icons", () => {
    expect(icon("calendar").getAttribute("viewBox")).toBe("0 0 24 24");
  });
});

describe("openDialog", () => {
  it("opens a modal and resolves on close", async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); };
    const done = openDialog("Title", "Body");
    const dlg = document.querySelector("dialog")!;
    expect(dlg.textContent).toContain("Body");
    (dlg.querySelector(".icon-btn") as HTMLButtonElement).click();
    await done;
    expect(document.querySelector("dialog")).toBeNull();
  });
});
