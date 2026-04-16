export const DEFAULT_ZOOM = 1;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;
export const DEFAULT_HOOK_EXECUTION_PATH = "~";
export const ZERO_SCROLL_OFFSET = { x: 0, y: 0 } as const;

export type ScrollOffset = {
  x: number;
  y: number;
};

export type WatchHook = {
  id: string;
  watchPath: string;
  command: string;
  executionPath: string;
  enabled: boolean;
};

export type HookRuntimeState =
  | "idle"
  | "watching"
  | "running"
  | "success"
  | "error"
  | "disabled";

export type HookStatus = {
  hookId: string;
  state: HookRuntimeState;
  message?: string;
};

export type WatchHistoryEntry = {
  path: string;
  fileName: string;
  lastOpenedAt: string;
  hooks: WatchHook[];
};

export type HistoryPathStatus = {
  path: string;
  fileName: string;
  exists: boolean;
};

export function normalizeScrollOffset(
  value?: Partial<ScrollOffset> | null,
): ScrollOffset {
  const x =
    typeof value?.x === "number" && Number.isFinite(value.x)
      ? value.x
      : ZERO_SCROLL_OFFSET.x;
  const y =
    typeof value?.y === "number" && Number.isFinite(value.y)
      ? value.y
      : ZERO_SCROLL_OFFSET.y;

  return { x, y };
}

export function appendRevision(url: string, revision: number): string {
  const [base, hash = ""] = url.split("#");
  const separator = base.includes("?") ? "&" : "?";
  const nextUrl = `${base}${separator}rev=${revision}`;
  return hash ? `${nextUrl}#${hash}` : nextUrl;
}

export function displayNameFromPath(path: string): string {
  const cleaned = path.replace(/\\/g, "/");
  const lastSegment = cleaned.split("/").filter(Boolean).pop();
  return lastSegment || path;
}

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM;
  const rounded = Math.round(value * 100) / 100;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rounded));
}

export function zoomPercentage(zoom: number): number {
  return Math.round(clampZoom(zoom) * 100);
}

export function upsertWatchHistoryEntry(
  history: WatchHistoryEntry[],
  nextEntry: WatchHistoryEntry,
): WatchHistoryEntry[] {
  return [
    nextEntry,
    ...history.filter((entry) => entry.path !== nextEntry.path),
  ];
}

export function removeWatchHistoryEntry(
  history: WatchHistoryEntry[],
  path: string,
): WatchHistoryEntry[] {
  return history.filter((entry) => entry.path !== path);
}
