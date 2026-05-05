"use client";

import { type CSSProperties, useState } from "react";
import {
  BoltIcon,
  ChevronDown,
  ChevronUp,
  GearIcon,
  PlusIcon,
} from "@/components/Icons";
import type { HookRuntimeState, HookStatus, WatchHook } from "@/lib/pdf";

type HookStateColors = {
  bg: string;
  fg: string;
  dot: string;
  pulse: boolean;
};

const STATE_COLORS: Record<HookRuntimeState, HookStateColors> = {
  watching: {
    bg: "var(--success-soft)",
    fg: "var(--success)",
    dot: "var(--success-dot)",
    pulse: true,
  },
  running: {
    bg: "var(--warning-soft)",
    fg: "var(--warning)",
    dot: "var(--warning-dot)",
    pulse: true,
  },
  success: {
    bg: "var(--success-soft)",
    fg: "var(--success)",
    dot: "var(--success-dot)",
    pulse: false,
  },
  error: {
    bg: "var(--danger-soft)",
    fg: "var(--danger)",
    dot: "var(--danger-dot)",
    pulse: false,
  },
  disabled: {
    bg: "var(--muted-bg)",
    fg: "var(--ink-faint)",
    dot: "#a0a0aa",
    pulse: false,
  },
  idle: {
    bg: "var(--muted-bg)",
    fg: "var(--ink-muted)",
    dot: "#a0a0aa",
    pulse: false,
  },
};

const STATE_LABELS: Record<HookRuntimeState, string> = {
  watching: "Watching",
  running: "Running",
  success: "Success",
  error: "Error",
  disabled: "Disabled",
  idle: "Idle",
};

function shortName(path: string): string {
  if (!path) return "—";
  const segments = path.split("/").filter(Boolean);
  return segments.length === 0 ? path : segments[segments.length - 1];
}

type HookRowProps = {
  hook: WatchHook;
  state: HookRuntimeState;
  onToggle: (hookId: string, nextEnabled: boolean) => void;
};

function HookRow({ hook, state, onToggle }: HookRowProps) {
  const [hover, setHover] = useState(false);
  const colors = STATE_COLORS[state];
  const enabled = hook.enabled;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: hover ? "var(--btn-hover)" : "transparent",
        borderLeft: `2px solid ${
          enabled ? "var(--accent)" : "transparent"
        }`,
        opacity: enabled ? 1 : 0.6,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          background: colors.bg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: colors.dot,
            animation: colors.pulse ? "rtpdf-pulse 1.6s infinite" : "none",
          }}
        />
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily:
              "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
          }}
        >
          {hook.command || <span style={{ color: "var(--ink-muted)" }}>(no command)</span>}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--ink-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 1,
          }}
        >
          on change <span style={{ color: "var(--ink-faint)" }}>·</span>{" "}
          {shortName(hook.watchPath)}
        </div>
      </div>
      <span
        style={{
          fontSize: 10.5,
          color: colors.fg,
          fontWeight: 600,
          padding: "2px 7px",
          background: colors.bg,
          borderRadius: 5,
          letterSpacing: 0.2,
        }}
      >
        {STATE_LABELS[state]}
      </span>
      <button
        type="button"
        onClick={() => onToggle(hook.id, !enabled)}
        title={enabled ? "Disable hook" : "Enable hook"}
        aria-label={enabled ? "Disable hook" : "Enable hook"}
        aria-pressed={enabled}
        style={{
          width: 26,
          height: 16,
          borderRadius: 8,
          position: "relative",
          background: enabled ? "var(--accent)" : "var(--muted-bg)",
          border: "0.5px solid rgba(0,0,0,0.1)",
          cursor: "pointer",
          transition: "background 160ms",
          padding: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 1,
            left: enabled ? 11 : 1,
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
            transition: "left 160ms",
          }}
        />
      </button>
    </div>
  );
}

type ChipTone = "live" | "idle" | "error" | "running";

const CHIP_COLORS: Record<ChipTone, { bg: string; fg: string; dot: string }> = {
  live: {
    bg: "var(--success-soft)",
    fg: "var(--success)",
    dot: "var(--success-dot)",
  },
  idle: { bg: "var(--muted-bg)", fg: "var(--ink-muted)", dot: "#a0a0aa" },
  error: {
    bg: "var(--danger-soft)",
    fg: "var(--danger)",
    dot: "var(--danger-dot)",
  },
  running: {
    bg: "var(--warning-soft)",
    fg: "var(--warning)",
    dot: "var(--warning-dot)",
  },
};

function CountChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: ChipTone;
}) {
  const colors = CHIP_COLORS[tone];
  const animate = tone === "live" || tone === "running";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 11,
        background: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: colors.dot,
          animation: animate ? "rtpdf-pulse 1.6s infinite" : "none",
        }}
      />
      {count} {label}
    </span>
  );
}

const COLLAPSED_HEIGHT = 38;
const EXPANDED_HEIGHT = 360;

type HookDockProps = {
  visible: boolean;
  hooks: WatchHook[];
  hookStatuses: Record<string, HookStatus>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleHook: (hookId: string, nextEnabled: boolean) => void;
  onAddHook: () => void;
  onOpenSettings: () => void;
};

function resolveHookState(
  hook: WatchHook,
  status: HookStatus | undefined,
): HookRuntimeState {
  if (!hook.enabled) return "disabled";
  return status?.state ?? "watching";
}

export default function HookDock({
  visible,
  hooks,
  hookStatuses,
  expanded,
  onToggleExpanded,
  onToggleHook,
  onAddHook,
  onOpenSettings,
}: HookDockProps) {
  if (!visible) return null;

  const states = hooks.map((hook) =>
    resolveHookState(hook, hookStatuses[hook.id]),
  );

  const counts = {
    running: states.filter((s) => s === "running").length,
    watching: states.filter(
      (s) => s === "watching" || s === "idle" || s === "success",
    ).length,
    error: states.filter((s) => s === "error").length,
    disabled: states.filter((s) => s === "disabled").length,
  };

  const dockStyle: CSSProperties = {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 10,
    borderRadius: 14,
    background: "var(--dock-bg)",
    border: "0.5px solid var(--dock-border)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    boxShadow:
      "0 8px 30px rgba(0,0,0,0.12), inset 0 0.5px 0 rgba(255,255,255,0.4)",
    overflow: "hidden",
    transition: "max-height 220ms ease",
    maxHeight: expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
  };

  return (
    <div data-rtpdf-hook-dock="" style={dockStyle}>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse hooks" : "Expand hooks"}
        style={{
          height: COLLAPSED_HEIGHT,
          padding: "0 10px 0 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          background: "transparent",
          border: "none",
          color: "var(--ink)",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          <BoltIcon style={{ color: "var(--accent)" }} />
          Hooks
          <span
            style={{
              fontSize: 11,
              color: "var(--ink-muted)",
              fontWeight: 500,
            }}
          >
            ({hooks.length})
          </span>
        </span>
        <div
          aria-hidden="true"
          style={{
            width: 0.5,
            height: 16,
            background: "var(--menu-border)",
            margin: "0 4px",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {counts.running > 0 ? (
            <CountChip label="running" count={counts.running} tone="running" />
          ) : null}
          <CountChip
            label="watching"
            count={counts.watching}
            tone="live"
          />
          {counts.error > 0 ? (
            <CountChip label="failing" count={counts.error} tone="error" />
          ) : null}
          {counts.disabled > 0 ? (
            <CountChip label="off" count={counts.disabled} tone="idle" />
          ) : null}
          {hooks.length === 0 ? (
            <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
              No hooks for this PDF — add one to regenerate it on source change.
            </span>
          ) : null}
        </div>

        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onAddHook();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onAddHook();
            }
          }}
          title="Add hook"
          aria-label="Add hook"
          style={{
            height: 24,
            padding: "0 8px",
            borderRadius: 6,
            cursor: "pointer",
            background: "var(--btn-hover)",
            color: "var(--ink)",
            fontSize: 11.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <PlusIcon /> Add
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSettings();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onOpenSettings();
            }
          }}
          title="Hook settings"
          aria-label="Open hook settings"
          style={{
            height: 24,
            width: 24,
            borderRadius: 6,
            cursor: "pointer",
            background: "transparent",
            color: "var(--ink-muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GearIcon />
        </span>
        <span
          aria-hidden="true"
          style={{
            color: "var(--ink-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          {expanded ? <ChevronDown /> : <ChevronUp />}
        </span>
      </button>

      {expanded ? (
        <div
          style={{
            padding: "4px 8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxHeight: EXPANDED_HEIGHT - COLLAPSED_HEIGHT - 4,
            overflowY: "auto",
          }}
        >
          {hooks.length === 0 ? (
            <div
              style={{
                padding: "20px 12px",
                textAlign: "center",
                color: "var(--ink-muted)",
                fontSize: 12,
              }}
            >
              No hooks for this PDF.
              <br />
              <button
                type="button"
                onClick={onAddHook}
                style={{
                  marginTop: 10,
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Add your first hook
              </button>
            </div>
          ) : (
            hooks.map((hook, index) => (
              <HookRow
                key={hook.id}
                hook={hook}
                state={states[index]}
                onToggle={onToggleHook}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
