"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import {
  CloseIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/Icons";
import {
  formatLastOpenedRelative,
  shrinkPath,
} from "@/lib/theme";
import type {
  HistoryPathStatus,
  HookRuntimeState,
  HookStatus,
  WatchHistoryEntry,
  WatchHook,
} from "@/lib/pdf";

const PILL_TONE: Record<
  HookRuntimeState,
  { bg: string; fg: string }
> = {
  watching: { bg: "var(--success-soft)", fg: "var(--success)" },
  running: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  success: { bg: "var(--success-soft)", fg: "var(--success)" },
  error: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  disabled: { bg: "var(--muted-bg)", fg: "var(--ink-faint)" },
  idle: { bg: "var(--muted-bg)", fg: "var(--ink-muted)" },
};

const STATE_LABELS: Record<HookRuntimeState, string> = {
  watching: "Watching",
  running: "Running",
  success: "Success",
  error: "Error",
  disabled: "Disabled",
  idle: "Idle",
};

type PdfSelectionLite = {
  path: string;
  fileName: string;
};

type SettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  selectedPdf: PdfSelectionLite | null;
  pathInput: string;
  onPathInputChange: (value: string) => void;
  onPickPdf: () => void;
  onPathSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPicking: boolean;
  isWatchingPath: boolean;
  watchHistory: WatchHistoryEntry[];
  historyStatuses: Record<string, HistoryPathStatus>;
  isCheckingHistory: boolean;
  historyError: string | null;
  onSelectHistory: (path: string) => void;
  onRemoveHistory: (path: string) => void;
  currentHistoryEntry: WatchHistoryEntry | null;
  templateCandidates: WatchHistoryEntry[];
  copySourcePath: string;
  onCopySourceChange: (value: string) => void;
  onCopyHooks: () => void;
  onAddHook: () => void;
  onUpdateHook: (hookId: string, patch: Partial<WatchHook>) => void;
  onRemoveHook: (hookId: string) => void;
  onToggleHook: (hookId: string, nextEnabled: boolean) => void;
  hookStatuses: Record<string, HookStatus>;
  hookPathStatuses: Record<string, HistoryPathStatus>;
  nowMs: number;
  updateCheckerSlot?: ReactNode;
};

export default function SettingsSheet({
  open,
  onClose,
  selectedPdf,
  pathInput,
  onPathInputChange,
  onPickPdf,
  onPathSubmit,
  isPicking,
  isWatchingPath,
  watchHistory,
  historyStatuses,
  isCheckingHistory,
  historyError,
  onSelectHistory,
  onRemoveHistory,
  currentHistoryEntry,
  templateCandidates,
  copySourcePath,
  onCopySourceChange,
  onCopyHooks,
  onAddHook,
  onUpdateHook,
  onRemoveHook,
  onToggleHook,
  hookStatuses,
  hookPathStatuses,
  nowMs,
  updateCheckerSlot,
}: SettingsSheetProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isBusy = isPicking || isWatchingPath;

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(0,0,0,0.32)",
          backdropFilter: "blur(3px)",
          animation: "rtpdf-fadeIn 200ms ease",
        }}
      />
      <div
        onClick={onClose}
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 51,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <section
          onClick={(event) => event.stopPropagation()}
          aria-modal="true"
          aria-labelledby="rtpdf-settings-title"
          role="dialog"
          style={{
            width: "min(640px, 100%)",
            maxHeight: "calc(100vh - 48px)",
            background: "var(--sheet-bg)",
            color: "var(--ink)",
            border: "0.5px solid var(--menu-border)",
            borderRadius: 14,
            boxShadow:
              "0 24px 80px rgba(0,0,0,0.32), inset 0 0.5px 0 rgba(255,255,255,0.4)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "rtpdf-modalIn 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <header
            style={{
              padding: "16px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "0.5px solid var(--menu-border)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-muted)",
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Settings
              </div>
              <h2
                id="rtpdf-settings-title"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--ink)",
                  margin: "2px 0 0",
                }}
              >
                Watch &amp; Hooks
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: "var(--btn-hover)",
                color: "var(--ink)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CloseIcon />
            </button>
          </header>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 18px 24px",
            }}
          >
            <Section
              title="Watched PDF"
              subtitle="Pick a file or paste an absolute path."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  onClick={onPickPdf}
                  disabled={isBusy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isBusy ? "wait" : "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  {isPicking ? "Opening picker…" : "Pick PDF"}
                </button>

                <form
                  onSubmit={onPathSubmit}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 8,
                  }}
                >
                  <input
                    type="text"
                    value={pathInput}
                    onChange={(event) => onPathInputChange(event.target.value)}
                    placeholder="/absolute/path/to/file.pdf"
                    spellCheck={false}
                    aria-label="Watched PDF path"
                    style={inputStyle()}
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    style={{
                      padding: "0 14px",
                      borderRadius: 7,
                      border: "0.5px solid var(--pill-border)",
                      background: "var(--pill-bg)",
                      color: "var(--ink)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: isBusy ? "wait" : "pointer",
                    }}
                  >
                    {isWatchingPath ? "Watching…" : "Save & watch"}
                  </button>
                </form>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11.5,
                    color: "var(--ink-muted)",
                  }}
                >
                  <code style={codeStyle()}>~/...</code> is expanded on the Rust
                  side. The saved path restores on reopen.
                </p>
              </div>
            </Section>

            {currentHistoryEntry ? (
              <Section
                title="Hooks"
                subtitle={`for ${currentHistoryEntry.fileName}`}
                action={
                  <button
                    type="button"
                    onClick={onAddHook}
                    style={pillButtonStyle()}
                  >
                    <PlusIcon /> Add hook
                  </button>
                }
              >
                {templateCandidates.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <select
                      value={copySourcePath}
                      onChange={(event) =>
                        onCopySourceChange(event.target.value)
                      }
                      style={selectStyle()}
                      aria-label="Copy hooks from another PDF"
                    >
                      <option value="">Copy hooks from another PDF…</option>
                      {templateCandidates.map((entry) => (
                        <option key={entry.path} value={entry.path}>
                          {entry.fileName} ({entry.hooks.length})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={onCopyHooks}
                      disabled={!copySourcePath}
                      style={{
                        ...pillButtonStyle(),
                        opacity: copySourcePath ? 1 : 0.5,
                        cursor: copySourcePath ? "pointer" : "default",
                      }}
                    >
                      Copy hooks
                    </button>
                  </div>
                ) : null}

                {currentHistoryEntry.hooks.length === 0 ? (
                  <EmptyHint>
                    No hooks yet. Add one to regenerate this PDF when a source
                    file changes.
                  </EmptyHint>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {currentHistoryEntry.hooks.map((hook, index) => {
                      const status = hookStatuses[hook.id];
                      const state: HookRuntimeState =
                        status?.state ??
                        (hook.enabled ? "watching" : "disabled");
                      const sourceStatus = hookPathStatuses[hook.id];

                      return (
                        <HookEditor
                          key={hook.id}
                          index={index + 1}
                          hook={hook}
                          state={state}
                          sourceExists={sourceStatus?.exists ?? null}
                          onUpdate={onUpdateHook}
                          onToggle={onToggleHook}
                          onRemove={onRemoveHook}
                        />
                      );
                    })}
                  </div>
                )}
              </Section>
            ) : (
              <Section title="Hooks">
                <EmptyHint>
                  Watch a PDF first, then its hooks can be configured here.
                </EmptyHint>
              </Section>
            )}

            <Section
              title="Saved history"
              subtitle="Missing files stay listed but cannot be opened."
              action={
                isCheckingHistory ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--ink-muted)",
                      fontWeight: 600,
                    }}
                  >
                    Checking…
                  </span>
                ) : null
              }
            >
              {historyError ? (
                <p
                  style={{
                    margin: "0 0 12px",
                    color: "var(--danger)",
                    fontSize: 12,
                  }}
                >
                  {historyError}
                </p>
              ) : null}

              {watchHistory.length === 0 ? (
                <EmptyHint>
                  No saved history yet. Successfully watched files appear here.
                </EmptyHint>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {watchHistory.map((entry) => (
                    <HistoryRow
                      key={entry.path}
                      entry={entry}
                      isCurrent={entry.path === selectedPdf?.path}
                      exists={historyStatuses[entry.path]?.exists ?? true}
                      nowMs={nowMs}
                      onSelect={onSelectHistory}
                      onRemove={onRemoveHistory}
                    />
                  ))}
                </div>
              )}
            </Section>

            {updateCheckerSlot ? (
              <Section title="App version">{updateCheckerSlot}</Section>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    minWidth: 0,
    padding: "8px 10px",
    borderRadius: 7,
    border: "0.5px solid var(--pill-border)",
    background: "var(--input-bg)",
    color: "var(--ink)",
    fontSize: 12,
    outline: "none",
    fontFamily:
      "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: "0.5px solid var(--pill-border)",
    background: "var(--input-bg)",
    color: "var(--ink)",
    fontSize: 12,
    outline: "none",
  };
}

function codeStyle(): React.CSSProperties {
  return {
    padding: "1px 5px",
    borderRadius: 5,
    background: "var(--muted-bg)",
    fontFamily:
      "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
    fontSize: 11,
  };
}

function pillButtonStyle(): React.CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 7,
    border: "0.5px solid var(--pill-border)",
    background: "var(--pill-bg)",
    color: "var(--ink)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <header
        style={{
          marginBottom: 10,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--ink-muted)",
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "14px",
        borderRadius: 8,
        background: "var(--muted-bg)",
        fontSize: 12,
        color: "var(--ink-muted)",
        lineHeight: 1.5,
        border: "0.5px dashed var(--pill-border)",
      }}
    >
      {children}
    </div>
  );
}

function HookEditor({
  index,
  hook,
  state,
  sourceExists,
  onUpdate,
  onToggle,
  onRemove,
}: {
  index: number;
  hook: WatchHook;
  state: HookRuntimeState;
  sourceExists: boolean | null;
  onUpdate: (hookId: string, patch: Partial<WatchHook>) => void;
  onToggle: (hookId: string, nextEnabled: boolean) => void;
  onRemove: (hookId: string) => void;
}) {
  const tone = PILL_TONE[state];

  return (
    <div
      style={{
        borderRadius: 10,
        border: "0.5px solid var(--pill-border)",
        background: "var(--pill-bg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "0.5px solid var(--pill-border)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 600 }}>
          Hook {index}
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 5,
            background: tone.bg,
            color: tone.fg,
            letterSpacing: 0.2,
          }}
        >
          {STATE_LABELS[state]}
        </span>
        {sourceExists === false ? (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 5,
              background: "var(--danger-soft)",
              color: "var(--danger)",
              letterSpacing: 0.2,
            }}
          >
            Source missing
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => onToggle(hook.id, !hook.enabled)}
          aria-label={hook.enabled ? "Disable hook" : "Enable hook"}
          aria-pressed={hook.enabled}
          style={{
            width: 28,
            height: 16,
            borderRadius: 8,
            position: "relative",
            background: hook.enabled ? "var(--accent)" : "var(--muted-bg)",
            border: "0.5px solid rgba(0,0,0,0.1)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 1,
              left: hook.enabled ? 13 : 1,
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
              transition: "left 160ms",
            }}
          />
        </button>
        <button
          type="button"
          onClick={() => onRemove(hook.id)}
          aria-label="Remove hook"
          title="Remove"
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            border: "none",
            cursor: "pointer",
            background: "transparent",
            color: "var(--ink-muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <TrashIcon />
        </button>
      </div>
      <div
        style={{
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Field label="Watch path">
          <input
            type="text"
            value={hook.watchPath}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onUpdate(hook.id, { watchPath: event.target.value })
            }
            placeholder="/path/to/source.blade.php"
            spellCheck={false}
            style={inputStyle()}
          />
        </Field>
        <Field label="Execution path">
          <input
            type="text"
            value={hook.executionPath}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onUpdate(hook.id, { executionPath: event.target.value })
            }
            placeholder="~"
            spellCheck={false}
            style={inputStyle()}
          />
        </Field>
        <Field label="Execute command">
          <textarea
            rows={2}
            value={hook.command}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onUpdate(hook.id, { command: event.target.value })
            }
            placeholder="php artisan test --filter=GeneratePdfTest"
            spellCheck={false}
            style={{
              ...inputStyle(),
              padding: "8px 10px",
              resize: "vertical",
              minHeight: 56,
            }}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          color: "var(--ink-muted)",
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function HistoryRow({
  entry,
  isCurrent,
  exists,
  nowMs,
  onSelect,
  onRemove,
}: {
  entry: WatchHistoryEntry;
  isCurrent: boolean;
  exists: boolean;
  nowMs: number;
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const interactive = exists && !isCurrent;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => interactive && onSelect(entry.path)}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(entry.path);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 7,
        cursor: interactive ? "pointer" : "default",
        background:
          hover && interactive ? "var(--btn-hover)" : "transparent",
        opacity: exists ? 1 : 0.55,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 22,
          borderRadius: 3,
          flexShrink: 0,
          background: exists
            ? "linear-gradient(180deg, #ff8a7e 0%, #e3493b 100%)"
            : "var(--muted-bg)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 6.5,
          fontWeight: 800,
        }}
      >
        {exists ? "PDF" : "—"}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {entry.fileName}
          {isCurrent ? (
            <span
              style={{
                marginLeft: 6,
                fontSize: 9.5,
                color: "var(--accent)",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Current
            </span>
          ) : null}
          {!exists ? (
            <span
              style={{
                marginLeft: 6,
                fontSize: 9.5,
                color: "var(--danger)",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Missing
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontSize: 10.5,
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
      <span
        style={{
          fontSize: 10.5,
          color: "var(--ink-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {formatLastOpenedRelative(entry.lastOpenedAt, nowMs)}
      </span>
      <span
        style={{
          fontSize: 10.5,
          color: "var(--ink-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {entry.hooks.length} hook{entry.hooks.length === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(entry.path);
        }}
        title="Remove from history"
        aria-label="Remove from history"
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          border: "none",
          cursor: "pointer",
          background: "transparent",
          color: "var(--ink-faint)",
          opacity: hover ? 1 : 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "opacity 120ms",
        }}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
