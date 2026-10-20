import type { AppContext } from "@/core/app";
import { h } from "@/core/dom";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import type { Field } from "@/core/schema";
import { defaultStatusColors, palettes, presets, statusKeys, statusLabels } from "./palettes";
import { applyTheme, computeTheme } from "./theme";

const statusFields: Field[] = statusKeys.map((k) => ({
  key: `ui.theme.status.${k}`,
  type: "color",
  label: statusLabels[k],
  default: defaultStatusColors[k],
  keywords: ["status", "colour", "color"],
}));

/** Look and feel: theme mode, palettes, colours, typography, density
 * and custom CSS, applied live through CSS custom properties. */
export default defineModule({
  id: "appearance",
  title: "Appearance",
  icon: "palette",
  settings: [
    {
      id: "appearance",
      title: "Appearance",
      icon: "palette",
      order: 10,
      fields: [
        { key: "ui.theme.presetPicker", type: "custom", label: "Presets", description: "A starting point; every value stays adjustable below.", default: null, render: presetPicker },
        {
          key: "ui.theme.mode", type: "segmented", label: "Theme", default: "system", keywords: ["dark", "light"],
          options: [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }],
        },
        {
          key: "ui.theme.palette", type: "select", label: "Background palette", default: "neutral",
          options: Object.entries(palettes).map(([value, p]) => ({ value, label: p.label })),
        },
        { key: "ui.theme.accent", type: "color", label: "Accent colour", default: "#4f46e5", keywords: ["highlight", "primary"] },
        { key: "ui.theme.highContrast", type: "toggle", label: "High contrast", description: "Stronger text and borders.", default: false, keywords: ["accessibility"] },
        {
          key: "ui.theme.density", type: "segmented", label: "Density", default: "cozy", keywords: ["spacing", "padding"],
          options: [{ value: "compact", label: "Compact" }, { value: "cozy", label: "Cozy" }, { value: "comfortable", label: "Roomy" }],
        },
        { key: "ui.theme.radius", type: "range", label: "Corner radius", default: 10, min: 0, max: 20, unit: " px", keywords: ["rounded"] },
        { key: "ui.theme.sidebarWidth", type: "range", label: "Sidebar width", default: 220, min: 160, max: 320, step: 10, unit: " px" },
        { key: "ui.theme.shadows", type: "toggle", label: "Shadows", default: true },
        { key: "ui.theme.animations", type: "toggle", label: "Animations", description: "Transitions and motion.", default: true, keywords: ["motion", "reduce"] },
      ],
    },
    {
      id: "typography",
      title: "Typography",
      icon: "palette",
      order: 11,
      fields: [
        {
          key: "ui.theme.font", type: "select", label: "Font", default: "system",
          options: [
            { value: "system", label: "System" },
            { value: "inter", label: "Inter" },
            { value: "humanist", label: "Humanist (Noto Sans)" },
            { value: "rounded", label: "Rounded (Nunito)" },
            { value: "serif", label: "Serif" },
            { value: "mono", label: "Monospace" },
          ],
        },
        { key: "ui.theme.fontCustom", type: "text", label: "Custom font family", description: "Any installed font; overrides the choice above.", default: "", placeholder: '"IBM Plex Sans"' },
        { key: "ui.theme.fontSize", type: "range", label: "Text size", default: 14, min: 11, max: 20, unit: " px", keywords: ["zoom", "scale"] },
      ],
    },
    {
      id: "status-colors",
      title: "Lesson colours",
      icon: "palette",
      order: 12,
      description: "How lesson states are drawn everywhere in the app.",
      fields: [
        {
          key: "ui.theme.statusStyle", type: "segmented", label: "Style", default: "tint",
          options: [{ value: "tint", label: "Tint" }, { value: "fill", label: "Filled" }, { value: "border", label: "Outline" }, { value: "stripe", label: "Stripe" }],
        },
        { key: "ui.theme.statusPreview", type: "custom", label: "Preview", default: null, render: statusPreview },
        ...statusFields,
      ],
    },
    {
      id: "custom-css",
      title: "Custom CSS",
      icon: "palette",
      order: 13,
      description: "Applied after the built-in styles. Every colour, size and spacing is a CSS variable on :root (e.g. --accent, --c-exam, --radius).",
      fields: [
        { key: "ui.theme.customCss", type: "text", label: "Stylesheet", default: "", multiline: true, monospace: true, placeholder: ".lesson { font-weight: 600; }" },
      ],
    },
  ],
  setup(ctx) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(computeTheme((k) => ctx.settings.get(k), media.matches));
    media.addEventListener("change", apply);
    const off = ctx.settings.document.subscribe(apply);
    return () => {
      off();
      media.removeEventListener("change", apply);
    };
  },
});

function presetPicker(ctx: AppContext): HTMLElement {
  return h(
    "div",
    { class: "preset-grid" },
    Object.entries(presets).map(([id, p]) =>
      h(
        "button",
        {
          type: "button",
          class: "preset",
          title: p.label,
          onclick: () => {
            ctx.settings.set("ui.theme.accent", p.accent);
            ctx.settings.set("ui.theme.palette", p.palette);
            for (const k of statusKeys) ctx.settings.set(`ui.theme.status.${k}`, p.status?.[k] ?? null);
            ctx.toasts.show("success", `Preset "${p.label}" applied`, undefined, 2000);
          },
          dataset: { preset: id },
        },
        h("span", { class: "preset-swatch", style: { background: palettes[p.palette].dark.bg } }, h("span", { style: { background: p.accent } })),
        p.label,
      ),
    ),
  );
}

function statusPreview(_ctx: AppContext, _scope: Scope): HTMLElement {
  return h(
    "div",
    { class: "status-preview" },
    statusKeys.map((k) =>
      h(
        "div",
        { class: ["status-box", k === "cancelled" || k === "removed" ? "struck" : false], style: { "--c": `var(--c-${k})` } },
        h("strong", null, "MATH"),
        h("span", { class: "small" }, statusLabels[k]),
      ),
    ),
  );
}
