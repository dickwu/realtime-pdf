"use client";

import { type CSSProperties, useEffect } from "react";
import { BoltIcon, PlusIcon } from "@/components/Icons";
import {
  formatLastOpenedRelative,
  shrinkPath,
} from "@/lib/theme";
import type { HistoryPathStatus, WatchHistoryEntry } from "@/lib/pdf";

const ROW_BASE_STYLE: CSSProperties = {
  padding: "7px 8px",
  borderRadius: 7,
  display: "flex",
  alignItems: "center",
  gap: 9,
};

type RecentsDropdownProps = {
  open: boolean;
  history: WatchHistoryEntry[];
  currentPath: string | null;
  historyStatuses: Record<string, HistoryPathStatus>;
  nowMs: number;
  onSelect: (path: string) => void;
  onPickNew: () => void;
  onClose: () => void;
};

export default function RecentsDropdown({
  open,
  history,
  currentPath,
  historyStatuses,
  nowMs,
  onSelect,
  onPickNew,
  onClose,
}: RecentsDropdownProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{ position: "fixed", inset: 0, zIndex: 40 }}
      />
      <div
        role="menu"
        style={{
          position: "absolute",
          top: 38,
          left: 8,
          zIndex: 41,
          width: 380,
          background: "var(--menu-bg)",
          border: "0.5px solid var(--menu-border)",
          borderRadius: 12,
          boxShadow:
            "0 12px 40px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.5) inset",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          padding: 6,
          animation: "rtpdf-menuIn 140ms ease-out",
        }}
      >
        <div
          style={{
            padding: "8px 10px 4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "var(--ink-muted)",
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Recent files
          </div>
          <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>
            {history.length}
          </span>
        </div>

        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 1,
            padding: "0 2px",
          }}
        >
          {history.length === 0 ? (
            <div
              style={{
                padding: "20px 12px",
                textAlign: "center",
                fontSize: 12,
                color: "var(--ink-muted)",
              }}
            >
              No recent PDFs yet.
            </div>
          ) : (
            history.map((entry) => {
              const status = historyStatuses[entry.path];
              const exists = status?.exists ?? true;
              const isCurrent = entry.path === currentPath;

              return (
                <button
                  type="button"
                  key={entry.path}
                  onClick={() => exists && onSelect(entry.path)}
                  disabled={!exists}
                  className="rtpdf-recents-item"
                  style={{
                    ...ROW_BASE_STYLE,
                    cursor: exists ? "pointer" : "default",
                    opacity: exists ? 1 : 0.55,
                    background: isCurrent ? "var(--row-active)" : "transparent",
                    border: "none",
                    color: "var(--ink)",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 20,
                      height: 24,
                      borderRadius: 3,
                      flexShrink: 0,
                      background: exists
                        ? "linear-gradient(180deg, #ff8a7e 0%, #e3493b 100%)"
                        : "var(--muted-bg)",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 7,
                      fontWeight: 800,
                      boxShadow: exists
                        ? "inset 0 0.5px 0 rgba(255,255,255,0.4)"
                        : "none",
                    }}
                  >
                    {exists ? "PDF" : "—"}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "var(--ink)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {entry.fileName}
                      </span>
                      {isCurrent ? (
                        <span
                          style={{
                            fontSize: 9.5,
                            color: "var(--accent)",
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            textTransform: "uppercase",
                          }}
                        >
                          Watching
                        </span>
                      ) : null}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--ink-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        direction: "rtl",
                        textAlign: "left",
                      }}
                    >
                      {shrinkPath(entry.path)}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 2,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{ fontSize: 10.5, color: "var(--ink-muted)" }}
                    >
                      {formatLastOpenedRelative(entry.lastOpenedAt, nowMs)}
                    </span>
                    {entry.hooks.length > 0 ? (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--ink-faint)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <BoltIcon style={{ width: 9, height: 10 }} />
                        {entry.hooks.length}
                      </span>
                    ) : null}
                    {!exists ? (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--danger)",
                          fontWeight: 600,
                        }}
                      >
                        Missing
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div
          aria-hidden="true"
          style={{
            height: 0.5,
            background: "var(--menu-border)",
            margin: "6px 4px",
          }}
        />

        <button
          type="button"
          onClick={onPickNew}
          className="rtpdf-recents-item"
          style={{
            ...ROW_BASE_STYLE,
            padding: "8px 8px",
            cursor: "pointer",
            color: "var(--accent)",
            fontWeight: 600,
            fontSize: 12.5,
            background: "transparent",
            border: "none",
            width: "100%",
            textAlign: "left",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 20,
              display: "inline-flex",
              justifyContent: "center",
            }}
          >
            <PlusIcon />
          </span>
          Open another PDF…
        </button>
      </div>
    </>
  );
}
