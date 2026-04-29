"use client";

import {
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  useState,
} from "react";
import {
  BoltIcon,
  ChevronDown,
  FitIcon,
  FolderIcon,
  GearIcon,
  MinusIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "@/components/Icons";
import type { Theme } from "@/lib/theme";

export type ToolbarStatusTone = "live" | "idle" | "error" | "running";

type ToolbarButtonProps = {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
  ariaLabel?: string;
  ariaExpanded?: boolean;
};

export function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
  style,
  ariaLabel,
  ariaExpanded,
}: ToolbarButtonProps) {
  const [hover, setHover] = useState(false);
  const background = active
    ? "var(--accent)"
    : hover
      ? "var(--btn-hover)"
      : "transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-expanded={ariaExpanded}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 26,
        minWidth: 26,
        padding: "0 8px",
        borderRadius: 7,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        background,
        color: active ? "#fff" : "var(--ink)",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        font: "inherit",
        fontSize: 12,
        fontWeight: 500,
        transition: "background 120ms",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

type StatusPillProps = {
  tone: ToolbarStatusTone;
  label: string;
};

const STATUS_TONES: Record<
  ToolbarStatusTone,
  { bg: string; fg: string; dot: string; pulse: boolean }
> = {
  live: {
    bg: "var(--success-soft)",
    fg: "var(--success)",
    dot: "var(--success-dot)",
    pulse: true,
  },
  idle: {
    bg: "var(--muted-bg)",
    fg: "var(--ink-muted)",
    dot: "#a0a0aa",
    pulse: false,
  },
  error: {
    bg: "var(--danger-soft)",
    fg: "var(--danger)",
    dot: "var(--danger-dot)",
    pulse: false,
  },
  running: {
    bg: "var(--warning-soft)",
    fg: "var(--warning)",
    dot: "var(--warning-dot)",
    pulse: true,
  },
};

export function StatusPill({ tone, label }: StatusPillProps) {
  const colors = STATUS_TONES[tone];
  return (
    <div
      style={{
        height: 22,
        padding: "0 8px 0 6px",
        background: colors.bg,
        color: colors.fg,
        borderRadius: 11,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.1,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: colors.dot,
          animation: colors.pulse ? "rtpdf-pulse 1.6s infinite" : "none",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

type ZoomGroupProps = {
  zoomPercent: number;
  onZoom: (direction: -1 | 1) => void;
  onFit: () => void;
  disabled?: boolean;
};

export function ZoomGroup({
  zoomPercent,
  onZoom,
  onFit,
  disabled,
}: ZoomGroupProps) {
  return (
    <div
      role="toolbar"
      aria-label="Zoom"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "var(--pill-bg)",
        border: "0.5px solid var(--pill-border)",
        borderRadius: 8,
        height: 26,
        padding: 1,
      }}
    >
      <ToolbarButton
        onClick={() => onZoom(-1)}
        title="Zoom out"
        disabled={disabled}
        style={{ height: 24, minWidth: 22, padding: "0 4px" }}
      >
        <MinusIcon />
      </ToolbarButton>
      <div
        style={{
          width: 44,
          textAlign: "center",
          fontSize: 11.5,
          fontVariantNumeric: "tabular-nums",
          color: "var(--ink)",
        }}
      >
        {zoomPercent}%
      </div>
      <ToolbarButton
        onClick={() => onZoom(1)}
        title="Zoom in"
        disabled={disabled}
        style={{ height: 24, minWidth: 22, padding: "0 4px" }}
      >
        <PlusIcon />
      </ToolbarButton>
      <div
        style={{ width: 0.5, height: 14, background: "var(--pill-border)" }}
        aria-hidden="true"
      />
      <ToolbarButton
        onClick={onFit}
        title="Fit page"
        disabled={disabled}
        style={{ height: 24, minWidth: 22, padding: "0 6px" }}
      >
        <FitIcon />
      </ToolbarButton>
    </div>
  );
}

type FileBadgeProps = {
  fileName: string;
  watching: boolean;
};

export function FileBadge({ fileName, watching }: FileBadgeProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 18,
          borderRadius: 3,
          flexShrink: 0,
          background: "linear-gradient(180deg, #ff8a7e 0%, #e3493b 100%)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 6,
          fontWeight: 800,
          letterSpacing: 0.2,
          boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.4)",
        }}
      >
        PDF
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 360,
        }}
      >
        {fileName}
      </span>
      {watching ? (
        <span
          style={{
            fontSize: 11,
            color: "var(--ink-muted)",
            whiteSpace: "nowrap",
          }}
        >
          — Watching
        </span>
      ) : null}
    </div>
  );
}

export function AppBadge() {
  return (
    <span
      aria-label="RealTime PDF"
      role="img"
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        background:
          "linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 80%, black) 100%)",
        boxShadow:
          "0 1px 3px rgba(10,132,255,0.35), inset 0 0.5px 0 rgba(255,255,255,0.4)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        flexShrink: 0,
      }}
    >
      <BoltIcon style={{ width: 11, height: 13 }} />
    </span>
  );
}

type ToolbarProps = {
  fileName: string | null;
  fileWatching: boolean;
  recentsOpen: boolean;
  onToggleRecents: () => void;
  recentsCount: number;
  zoomPercent: number;
  onZoom: (direction: -1 | 1) => void;
  onFit: () => void;
  zoomDisabled: boolean;
  showStatusPill: boolean;
  statusTone: ToolbarStatusTone;
  statusLabel: string;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  recentsSlot: ReactNode;
};

export default function Toolbar({
  fileName,
  fileWatching,
  recentsOpen,
  onToggleRecents,
  recentsCount,
  zoomPercent,
  onZoom,
  onFit,
  zoomDisabled,
  showStatusPill,
  statusTone,
  statusLabel,
  theme,
  onToggleTheme,
  onOpenSettings,
  recentsSlot,
}: ToolbarProps) {
  const dark = theme === "dark";

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 40,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        background: "var(--toolbar-bg)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        borderBottom: "0.5px solid var(--toolbar-border)",
        position: "relative",
        zIndex: 20,
      }}
    >
      <AppBadge />

      <div
        aria-hidden="true"
        style={{
          width: 0.5,
          height: 18,
          background: "var(--toolbar-border)",
          margin: "0 4px",
        }}
      />

      <div style={{ position: "relative" }}>
        <ToolbarButton
          onClick={onToggleRecents}
          active={recentsOpen}
          title="Recent PDFs"
          ariaExpanded={recentsOpen}
        >
          <FolderIcon />
          <span>Recents</span>
          {recentsCount > 0 ? (
            <span
              style={{
                fontSize: 10.5,
                color: recentsOpen ? "rgba(255,255,255,0.85)" : "var(--ink-muted)",
                fontWeight: 600,
              }}
            >
              {recentsCount}
            </span>
          ) : null}
          <ChevronDown />
        </ToolbarButton>
        {recentsSlot}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minWidth: 0,
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {fileName ? (
          <FileBadge fileName={fileName} watching={fileWatching} />
        ) : (
          <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>
            No file watched
          </span>
        )}
      </div>

      <ZoomGroup
        zoomPercent={zoomPercent}
        onZoom={onZoom}
        onFit={onFit}
        disabled={zoomDisabled}
      />

      {showStatusPill ? (
        <StatusPill tone={statusTone} label={statusLabel} />
      ) : null}

      <ToolbarButton
        onClick={onToggleTheme}
        title={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {dark ? <SunIcon /> : <MoonIcon />}
      </ToolbarButton>

      <ToolbarButton onClick={onOpenSettings} title="Settings">
        <GearIcon />
      </ToolbarButton>
    </div>
  );
}
