export type Theme = "light" | "dark";

export const ACCENT_COLOR = "#0a84ff";

export type ThemeVars = Record<`--${string}`, string>;

const SHARED: ThemeVars = {
  "--accent": ACCENT_COLOR,
  "--accent-soft": "rgba(10, 132, 255, 0.16)",
};

export const LIGHT_THEME_VARS: ThemeVars = {
  ...SHARED,
  "--ink": "rgba(0, 0, 0, 0.88)",
  "--ink-muted": "rgba(0, 0, 0, 0.52)",
  "--ink-faint": "rgba(0, 0, 0, 0.35)",
  "--win-bg": "#fafafc",
  "--toolbar-bg": "rgba(245, 245, 247, 0.88)",
  "--toolbar-border": "rgba(0, 0, 0, 0.08)",
  "--btn-hover": "rgba(0, 0, 0, 0.06)",
  "--pill-bg": "rgba(255, 255, 255, 0.62)",
  "--pill-hover": "rgba(255, 255, 255, 0.92)",
  "--pill-border": "rgba(0, 0, 0, 0.10)",
  "--menu-bg": "rgba(248, 248, 250, 0.92)",
  "--menu-border": "rgba(0, 0, 0, 0.10)",
  "--row-active": "rgba(0, 0, 0, 0.05)",
  "--muted-bg": "rgba(0, 0, 0, 0.05)",
  "--canvas-bg": "#8e8e93",
  "--dock-bg": "rgba(252, 252, 254, 0.82)",
  "--dock-border": "rgba(0, 0, 0, 0.10)",
  "--sheet-bg": "rgba(250, 250, 252, 0.96)",
  "--input-bg": "#ffffff",
  "--success": "#137a3d",
  "--success-soft": "rgba(40, 200, 100, 0.16)",
  "--success-dot": "#28c840",
  "--danger": "#c62a2a",
  "--danger-soft": "rgba(255, 80, 90, 0.16)",
  "--danger-dot": "#ff4d4f",
  "--warning": "#a86200",
  "--warning-soft": "rgba(255, 170, 40, 0.20)",
  "--warning-dot": "#ffaa28",
};

export const DARK_THEME_VARS: ThemeVars = {
  ...SHARED,
  "--ink": "rgba(255, 255, 255, 0.92)",
  "--ink-muted": "rgba(255, 255, 255, 0.55)",
  "--ink-faint": "rgba(255, 255, 255, 0.35)",
  "--win-bg": "#1c1c1e",
  "--toolbar-bg": "rgba(40, 40, 44, 0.92)",
  "--toolbar-border": "rgba(255, 255, 255, 0.08)",
  "--btn-hover": "rgba(255, 255, 255, 0.08)",
  "--pill-bg": "rgba(255, 255, 255, 0.06)",
  "--pill-hover": "rgba(255, 255, 255, 0.10)",
  "--pill-border": "rgba(255, 255, 255, 0.10)",
  "--menu-bg": "rgba(40, 40, 44, 0.94)",
  "--menu-border": "rgba(255, 255, 255, 0.10)",
  "--row-active": "rgba(255, 255, 255, 0.08)",
  "--muted-bg": "rgba(255, 255, 255, 0.06)",
  "--canvas-bg": "#16161a",
  "--dock-bg": "rgba(50, 50, 54, 0.85)",
  "--dock-border": "rgba(255, 255, 255, 0.10)",
  "--sheet-bg": "#1c1c1e",
  "--input-bg": "rgba(255, 255, 255, 0.05)",
  "--success": "#3ddc84",
  "--success-soft": "rgba(40, 200, 100, 0.20)",
  "--success-dot": "#28c840",
  "--danger": "#ff7a7e",
  "--danger-soft": "rgba(255, 80, 90, 0.22)",
  "--danger-dot": "#ff4d4f",
  "--warning": "#ffb547",
  "--warning-soft": "rgba(255, 170, 40, 0.22)",
  "--warning-dot": "#ffaa28",
};

export function themeVars(theme: Theme): ThemeVars {
  return theme === "dark" ? DARK_THEME_VARS : LIGHT_THEME_VARS;
}

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function shrinkPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

export function formatRelativeReload(
  fromMs: number | null,
  nowMs: number,
): string {
  if (fromMs === null) return "—";

  const diff = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatLastOpenedRelative(
  iso: string,
  nowMs: number = Date.now(),
): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";

  const diffSec = Math.floor((nowMs - parsed) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;

  return new Date(parsed).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}
