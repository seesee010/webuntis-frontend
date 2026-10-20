import { defaultStatusColors, palettes, statusKeys, type Neutrals } from "./palettes";

/** Reads a setting (with defaults applied). */
export type Getter = <T>(key: string) => T;

export interface Theme {
  dark: boolean;
  vars: Record<string, string>;
  attrs: Record<string, string>;
  css: string;
}

const densities: Record<string, string> = { compact: "0.75", cozy: "1", comfortable: "1.3" };

export const fonts: Record<string, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  humanist: '"Noto Sans", "Open Sans", "Segoe UI", sans-serif',
  rounded: '"Nunito", "Varela Round", "Quicksand", system-ui, sans-serif',
  serif: '"Source Serif Pro", Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
};

/** Computes all CSS variables and root attributes from the settings.
 * Pure, so it can be unit tested without a DOM. */
export function computeTheme(get: Getter, systemDark: boolean): Theme {
  const mode = get<string>("ui.theme.mode");
  const dark = mode === "dark" || (mode === "system" && systemDark);
  const palette = palettes[get<string>("ui.theme.palette")] ?? palettes.neutral;
  const n: Neutrals = { ...(dark ? palette.dark : palette.light) };

  if (get<boolean>("ui.theme.highContrast")) {
    n.text = dark ? "#ffffff" : "#000000";
    n.muted = dark ? "#d0d4dc" : "#3a3f4b";
    n.border = dark ? "#6b7280" : "#6b7280";
  }

  const accent = get<string>("ui.theme.accent");
  const customFont = get<string>("ui.theme.fontCustom").trim();
  const vars: Record<string, string> = {
    "--bg": n.bg,
    "--surface": n.surface,
    "--surface-2": n.surface2,
    "--border": n.border,
    "--text": n.text,
    "--muted": n.muted,
    "--accent": accent,
    "--accent-fg": readableOn(accent),
    "--font": customFont ? `${customFont}, ${fonts.system}` : (fonts[get<string>("ui.theme.font")] ?? fonts.system),
    "--font-size": `${get<number>("ui.theme.fontSize")}px`,
    "--radius": `${get<number>("ui.theme.radius")}px`,
    "--radius-sm": `${Math.round(get<number>("ui.theme.radius") * 0.6)}px`,
    "--space": densities[get<string>("ui.theme.density")] ?? "1",
    "--sidebar-w": `${get<number>("ui.theme.sidebarWidth")}px`,
    "--transition": get<boolean>("ui.theme.animations") ? "150ms ease" : "0s",
    "--shadow": get<boolean>("ui.theme.shadows")
      ? dark
        ? "0 1px 2px rgb(0 0 0 / 0.4)"
        : "0 1px 2px rgb(16 24 40 / 0.06), 0 1px 3px rgb(16 24 40 / 0.08)"
      : "none",
  };
  for (const k of statusKeys) {
    vars[`--c-${k}`] = get<string>(`ui.theme.status.${k}`) || defaultStatusColors[k];
  }

  return {
    dark,
    vars,
    attrs: {
      "data-theme": dark ? "dark" : "light",
      "data-status-style": get<string>("ui.theme.statusStyle"),
      "data-animations": get<boolean>("ui.theme.animations") ? "on" : "off",
    },
    css: get<string>("ui.theme.customCss"),
  };
}

/** Black or white, whichever is more readable on the given colour. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return "#ffffff";
  const v = parseInt(m[1], 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#111111" : "#ffffff";
}

/** Applies a theme to the document. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(theme.attrs)) root.setAttribute(k, v);
  root.style.colorScheme = theme.dark ? "dark" : "light";

  let style = document.getElementById("user-css") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "user-css";
    document.head.appendChild(style);
  }
  if (style.textContent !== theme.css) style.textContent = theme.css;
}
