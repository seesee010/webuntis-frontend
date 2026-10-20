// Theme data: neutral palettes and colour presets.

export interface Neutrals {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
}

export const palettes: Record<string, { label: string; light: Neutrals; dark: Neutrals }> = {
  neutral: {
    label: "Neutral",
    light: { bg: "#f6f7fb", surface: "#ffffff", surface2: "#f1f2f7", border: "#e3e5ee", text: "#1c1e29", muted: "#6b7083" },
    dark: { bg: "#0f1117", surface: "#171a22", surface2: "#1f232d", border: "#2a2f3b", text: "#e7e9f0", muted: "#9097a8" },
  },
  slate: {
    label: "Slate",
    light: { bg: "#f1f5f9", surface: "#ffffff", surface2: "#e9eef5", border: "#d8e0ea", text: "#0f172a", muted: "#64748b" },
    dark: { bg: "#0b1120", surface: "#111827", surface2: "#1a2333", border: "#253047", text: "#e2e8f0", muted: "#94a3b8" },
  },
  warm: {
    label: "Warm paper",
    light: { bg: "#f7f3ec", surface: "#fffdf8", surface2: "#f1ebe1", border: "#e4dccd", text: "#2b2620", muted: "#7a6f60" },
    dark: { bg: "#17140f", surface: "#1f1b15", surface2: "#29241c", border: "#3a3327", text: "#eee6d8", muted: "#a89a85" },
  },
  nord: {
    label: "Nord",
    light: { bg: "#eceff4", surface: "#f8f9fb", surface2: "#e5e9f0", border: "#d8dee9", text: "#2e3440", muted: "#5e6b80" },
    dark: { bg: "#2e3440", surface: "#3b4252", surface2: "#434c5e", border: "#4c566a", text: "#eceff4", muted: "#a3adbf" },
  },
  oled: {
    label: "OLED black",
    light: { bg: "#ffffff", surface: "#ffffff", surface2: "#f4f4f5", border: "#e4e4e7", text: "#09090b", muted: "#71717a" },
    dark: { bg: "#000000", surface: "#0a0a0a", surface2: "#141414", border: "#262626", text: "#fafafa", muted: "#a1a1aa" },
  },
};

export const statusKeys = [
  "regular",
  "cancelled",
  "removed",
  "exam",
  "event",
  "substitution",
  "additional",
  "no-teacher",
] as const;
export type StatusKey = (typeof statusKeys)[number];

export const statusLabels: Record<StatusKey, string> = {
  regular: "Regular lesson",
  cancelled: "Cancelled",
  removed: "Class removed",
  exam: "Exam",
  event: "Event",
  substitution: "Substitution / change",
  additional: "Additional lesson",
  "no-teacher": "No teacher",
};

export const defaultStatusColors: Record<StatusKey, string> = {
  regular: "#64748b",
  cancelled: "#e5484d",
  removed: "#8b8d98",
  exam: "#c026d3",
  event: "#2563eb",
  substitution: "#16a34a",
  additional: "#0891b2",
  "no-teacher": "#d97706",
};

export interface Preset {
  label: string;
  accent: string;
  palette: keyof typeof palettes;
  status?: Partial<Record<StatusKey, string>>;
}

/** One-click looks; they only set existing settings, so everything stays
 * individually adjustable afterwards. */
export const presets: Record<string, Preset> = {
  indigo: { label: "Indigo", accent: "#4f46e5", palette: "neutral" },
  ocean: { label: "Ocean", accent: "#0284c7", palette: "slate", status: { event: "#7c3aed" } },
  forest: { label: "Forest", accent: "#15803d", palette: "warm", status: { substitution: "#0d9488" } },
  sunset: { label: "Sunset", accent: "#ea580c", palette: "warm", status: { event: "#db2777" } },
  rose: { label: "Rose", accent: "#e11d48", palette: "neutral", status: { cancelled: "#b91c1c" } },
  nord: {
    label: "Nord",
    accent: "#88c0d0",
    palette: "nord",
    status: { cancelled: "#bf616a", exam: "#b48ead", event: "#5e81ac", substitution: "#a3be8c", "no-teacher": "#d08770", additional: "#8fbcbb" },
  },
  midnight: { label: "Midnight", accent: "#a78bfa", palette: "oled" },
};
