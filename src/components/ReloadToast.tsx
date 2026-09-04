"use client";

import { RefreshIcon } from "@/components/Icons";

type ReloadToastProps = {
  visible: boolean;
  fileName: string | null;
  message?: string;
};

export function ReloadToast({ visible, fileName, message }: ReloadToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: `translateX(-50%) translateY(${visible ? 0 : -20}px)`,
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
        zIndex: 30,
        transition:
          "opacity 220ms, transform 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        background: "var(--menu-bg)",
        border: "0.5px solid var(--menu-border)",
        borderRadius: 12,
        padding: "8px 14px 8px 10px",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--success-soft)",
          color: "var(--success)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <RefreshIcon />
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
          {message ?? "Reloaded"}
        </div>
        {fileName ? (
          <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>
            {fileName}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type AmbientReloadIndicatorProps = {
  label: string;
  bottomOffset: number;
  tone: "live" | "idle" | "error";
};

const TONE_DOT: Record<"live" | "idle" | "error", string> = {
  live: "var(--success-dot)",
  idle: "#a0a0aa",
  error: "var(--danger-dot)",
};

export function AmbientReloadIndicator({
  label,
  bottomOffset,
  tone,
}: AmbientReloadIndicatorProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: 18,
        bottom: bottomOffset,
        zIndex: 11,
        display: "flex",
        alignItems: "center",
        gap: 7,
        fontSize: 11,
        color: "var(--ink-muted)",
        transition: "bottom 220ms ease",
        pointerEvents: "none",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: TONE_DOT[tone],
          animation: tone === "live" ? "rtpdf-pulse 1.6s infinite" : "none",
        }}
      />
      {label}
    </div>
  );
}
