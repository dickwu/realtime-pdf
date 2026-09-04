"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { CloseIcon, PlusIcon, TrashIcon } from "@/components/Icons";
import type { ToolbarStatusTone } from "@/components/Toolbar";
import { formatLastOpenedRelative, shrinkPath } from "@/lib/theme";
import type {
  HistoryPathStatus,
  HookRuntimeState,
  HookStatus,
  WatchHistoryEntry,
  WatchHook,
} from "@/lib/pdf";

export const INSPECTOR_WIDTH = 460;

const MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace";
const PDF_RED = "#e3493b";
const RAIL = "color-mix(in srgb, var(--ink) 18%, transparent)";
const RAIL_MUTED = "color-mix(in srgb, var(--ink) 9%, transparent)";

type Tone = { fg: string; dot: string; soft: string; pulse: boolean };

const HOOK_TONE: Record<HookRuntimeState, Tone> = {
  watching: {
    fg: "var(--success)",
    dot: "var(--success-dot)",
    soft: "var(--success-soft)",
    pulse: true,
  },
  running: {
    fg: "var(--warning)",
    dot: "var(--warning-dot)",
    soft: "var(--warning-soft)",
    pulse: true,
  },
  success: {
    fg: "var(--success)",
    dot: "var(--success-dot)",
    soft: "var(--success-soft)",
    pulse: false,
  },
  error: {
    fg: "var(--danger)",
    dot: "var(--danger-dot)",
    soft: "var(--danger-soft)",
    pulse: false,
  },
  disabled: {
    fg: "var(--ink-faint)",
    dot: "#a0a0aa",
    soft: "var(--muted-bg)",
    pulse: false,
  },
  idle: {
    fg: "var(--ink-muted)",
    dot: "#a0a0aa",
    soft: "var(--muted-bg)",
    pulse: false,
  },
};

// Same vocabulary as the hook dock, so a hook reads the same in both places.
const HOOK_STATE_LABELS: Record<HookRuntimeState, string> = {
  watching: "Watching",
  running: "Running",
  success: "Success",
  error: "Error",
  disabled: "Disabled",
  idle: "Idle",
};

const WATCH_TONE: Record<ToolbarStatusTone, Tone> = {
  live: HOOK_TONE.watching,
  running: HOOK_TONE.running,
  error: HOOK_TONE.error,
  idle: HOOK_TONE.idle,
};

type PdfSelectionLite = {
  path: string;
  fileName: string;
};

type SettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  selectedPdf: PdfSelectionLite | null;
  watchTone: ToolbarStatusTone;
  watchMessage: string;
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
  watchTone,
  watchMessage,
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
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    panelRef.current?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isBusy = isPicking || isWatchingPath;
  const anyMissing = watchHistory.some(
    (entry) => historyStatuses[entry.path]?.exists === false,
  );

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="rtpdf-settings-title"
      className="rtpdf-inspector"
      style={{
        width: INSPECTOR_WIDTH,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--sheet-bg)",
        color: "var(--ink)",
        borderLeft: "0.5px solid var(--menu-border)",
        boxShadow: "-16px 0 40px rgba(0,0,0,0.10)",
        outline: "none",
        position: "relative",
        zIndex: 15,
      }}
    >
      <header
        style={{
          height: 44,
          flexShrink: 0,
          padding: "0 14px 0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "0.5px solid var(--menu-border)",
        }}
      >
        <h2
          id="rtpdf-settings-title"
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.01,
          }}
        >
          Settings
        </h2>
        <IconButton onClick={onClose} label="Close settings" size={26}>
          <CloseIcon />
        </IconButton>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <WatchedPdfHero
          selectedPdf={selectedPdf}
          tone={watchTone}
          message={watchMessage}
          pathInput={pathInput}
          onPathInputChange={onPathInputChange}
          onPickPdf={onPickPdf}
          onPathSubmit={onPathSubmit}
          isPicking={isPicking}
          isWatchingPath={isWatchingPath}
          isBusy={isBusy}
        />

        <div style={{ padding: "22px 20px 8px" }}>
          <Section
            title="Hooks"
            hint={
              currentHistoryEntry
                ? `Rebuild ${currentHistoryEntry.fileName} whenever a source file changes.`
                : "Watch a PDF first. Its hooks are set up here."
            }
            action={
              currentHistoryEntry ? (
                <PillButton onClick={onAddHook}>
                  <PlusIcon /> Add hook
                </PillButton>
              ) : null
            }
          >
            {currentHistoryEntry ? (
              <>
                {currentHistoryEntry.hooks.length === 0 ? (
                  <Quiet>
                    No hooks yet. Add one to run a command, such as your
                    PDF-generating test, when a template changes.
                  </Quiet>
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
                      const state: HookRuntimeState = !hook.enabled
                        ? "disabled"
                        : (status?.state ?? "watching");

                      return (
                        <HookRail
                          key={hook.id}
                          index={index + 1}
                          hook={hook}
                          state={state}
                          message={hook.enabled ? status?.message : undefined}
                          sourceExists={hookPathStatuses[hook.id]?.exists}
                          pdfFileName={currentHistoryEntry.fileName}
                          onUpdate={onUpdateHook}
                          onToggle={onToggleHook}
                          onRemove={onRemoveHook}
                        />
                      );
                    })}
                  </div>
                )}

                {templateCandidates.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <select
                      value={copySourcePath}
                      onChange={(event) =>
                        onCopySourceChange(event.target.value)
                      }
                      aria-label="Copy hooks from another PDF"
                      style={selectStyle}
                    >
                      <option value="">Copy hooks from another PDF…</option>
                      {templateCandidates.map((entry) => (
                        <option key={entry.path} value={entry.path}>
                          {entry.fileName} (
                          {pluralize(entry.hooks.length, "hook")})
                        </option>
                      ))}
                    </select>
                    <PillButton
                      onClick={onCopyHooks}
                      disabled={!copySourcePath}
                    >
                      Copy hooks
                    </PillButton>
                  </div>
                ) : null}
              </>
            ) : null}
          </Section>

          <Section
            title="Recent PDFs"
            hint={
              anyMissing
                ? "Files that can't be found stay listed until you remove them."
                : undefined
            }
            action={
              isCheckingHistory ? (
                <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
                  Checking…
                </span>
              ) : null
            }
          >
            {historyError ? (
              <p
                style={{
                  margin: "0 0 10px",
                  color: "var(--danger)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {historyError}
              </p>
            ) : null}

            {watchHistory.length === 0 ? (
              <Quiet>
                Nothing yet. Every PDF you watch is remembered here, together
                with its hooks.
              </Quiet>
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
        </div>
      </div>

      {updateCheckerSlot ? (
        <footer
          style={{
            flexShrink: 0,
            padding: "12px 20px",
            borderTop: "0.5px solid var(--menu-border)",
          }}
        >
          {updateCheckerSlot}
        </footer>
      ) : null}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Watched PDF                                                          */
/* ------------------------------------------------------------------ */

function WatchedPdfHero({
  selectedPdf,
  tone,
  message,
  pathInput,
  onPathInputChange,
  onPickPdf,
  onPathSubmit,
  isPicking,
  isWatchingPath,
  isBusy,
}: {
  selectedPdf: PdfSelectionLite | null;
  tone: ToolbarStatusTone;
  message: string;
  pathInput: string;
  onPathInputChange: (value: string) => void;
  onPickPdf: () => void;
  onPathSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPicking: boolean;
  isWatchingPath: boolean;
  isBusy: boolean;
}) {
  const colors = WATCH_TONE[tone];
  const statusText = tone === "live" ? "Watching for changes" : message;

  return (
    <div
      style={{
        padding: "18px 20px 20px",
        borderBottom: "0.5px solid var(--menu-border)",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <PdfChip exists={Boolean(selectedPdf)} size="lg" />
        <div style={{ minWidth: 0, flex: 1 }}>
          {selectedPdf ? (
            <>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: -0.2,
                  lineHeight: "22px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedPdf.fileName}
              </div>
              <PathText
                path={selectedPdf.path}
                style={{ marginTop: 3, fontSize: 11.5 }}
              />
              {statusText ? (
                <StatusLine tone={colors} text={statusText} />
              ) : null}
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: -0.1,
                  lineHeight: "22px",
                }}
              >
                No PDF is being watched
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  color: "var(--ink-muted)",
                }}
              >
                Choose a file, or paste its path below.
              </div>
              {tone === "error" && message ? (
                <StatusLine tone={colors} text={message} />
              ) : null}
            </>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onPickPdf}
          disabled={isBusy}
          style={{
            alignSelf: "flex-start",
            padding: "7px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: isBusy ? "wait" : "pointer",
            opacity: isBusy ? 0.7 : 1,
          }}
        >
          {isPicking
            ? "Choosing…"
            : selectedPdf
              ? "Choose another PDF…"
              : "Choose PDF…"}
        </button>

        <form
          onSubmit={onPathSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 6,
          }}
        >
          <input
            type="text"
            value={pathInput}
            onChange={(event) => onPathInputChange(event.target.value)}
            placeholder="~/path/to/file.pdf"
            spellCheck={false}
            aria-label="Watched PDF path"
            style={inputStyle}
          />
          <PillButton type="submit" disabled={isBusy}>
            {isWatchingPath ? "Watching…" : "Watch"}
          </PillButton>
        </form>
        <p
          style={{
            margin: 0,
            fontSize: 11.5,
            lineHeight: 1.45,
            color: "var(--ink-faint)",
          }}
        >
          The path is remembered and watched again next time you open the app.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hook rail                                                             */
/* ------------------------------------------------------------------ */

const HEADER_HEIGHT = 36;
const TERMINAL_HEIGHT = 28;

function HookRail({
  index,
  hook,
  state,
  message,
  sourceExists,
  pdfFileName,
  onUpdate,
  onToggle,
  onRemove,
}: {
  index: number;
  hook: WatchHook;
  state: HookRuntimeState;
  message: string | undefined;
  sourceExists: boolean | undefined;
  pdfFileName: string;
  onUpdate: (hookId: string, patch: Partial<WatchHook>) => void;
  onToggle: (hookId: string, nextEnabled: boolean) => void;
  onRemove: (hookId: string) => void;
}) {
  const tone = HOOK_TONE[state];
  const enabled = hook.enabled;
  const showOutput =
    Boolean(message) &&
    (state === "running" || state === "success" || state === "error");

  return (
    <article
      aria-label={`Hook ${index}`}
      style={{
        borderRadius: 10,
        border: "0.5px solid var(--pill-border)",
        background: "var(--pill-bg)",
        padding: "0 12px 10px 10px",
      }}
    >
      <div style={{ position: "relative" }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 9.25,
            top: HEADER_HEIGHT / 2,
            bottom: TERMINAL_HEIGHT / 2,
            width: 1.5,
            borderRadius: 1,
            background: enabled ? RAIL : RAIL_MUTED,
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "20px minmax(0, 1fr) auto auto",
            alignItems: "center",
            gap: 8,
            height: HEADER_HEIGHT,
          }}
        >
          <RailCell>
            <StatusDot tone={tone} size={8} />
          </RailCell>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
              Hook {index}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: tone.fg }}>
              {HOOK_STATE_LABELS[state]}
            </span>
          </div>
          <Switch
            checked={enabled}
            onChange={(next) => onToggle(hook.id, next)}
            label={enabled ? "Disable hook" : "Enable hook"}
          />
          <IconButton
            onClick={() => onRemove(hook.id)}
            label="Remove hook"
            size={22}
          >
            <TrashIcon />
          </IconButton>
        </div>

        <div style={{ opacity: enabled ? 1 : 0.55 }}>
          <RailStep
            label="When this file changes"
            enabled={enabled}
            note={
              sourceExists === false && hook.watchPath.trim() !== ""
                ? { text: "This file can't be found.", tone: "danger" }
                : undefined
            }
          >
            <input
              type="text"
              value={hook.watchPath}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onUpdate(hook.id, { watchPath: event.target.value })
              }
              placeholder="~/app/resources/views/pdf/invoice.blade.php"
              spellCheck={false}
              aria-label={`Hook ${index} source file`}
              style={inputStyle}
            />
          </RailStep>

          <RailStep label="Run this command" enabled={enabled}>
            <textarea
              rows={2}
              value={hook.command}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                onUpdate(hook.id, { command: event.target.value })
              }
              placeholder="php artisan test --filter=GeneratePdfTest"
              spellCheck={false}
              aria-label={`Hook ${index} command`}
              style={textareaStyle}
            />
          </RailStep>

          <RailStep
            label="In this folder"
            enabled={enabled}
            note={{ text: "Leave empty to use your home folder." }}
          >
            <input
              type="text"
              value={hook.executionPath}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onUpdate(hook.id, { executionPath: event.target.value })
              }
              placeholder="~"
              spellCheck={false}
              aria-label={`Hook ${index} folder`}
              style={inputStyle}
            />
          </RailStep>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "20px minmax(0, 1fr)",
            alignItems: "center",
            gap: 8,
            height: TERMINAL_HEIGHT,
            opacity: enabled ? 1 : 0.55,
          }}
        >
          <RailCell>
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: PDF_RED,
                boxShadow: "0 0 0 2.5px var(--sheet-bg)",
              }}
            />
          </RailCell>
          <span
            style={{
              fontSize: 12,
              color: "var(--ink-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Then {pdfFileName} reloads.
          </span>
        </div>
      </div>

      {showOutput ? (
        <div
          className="rtpdf-inspector__output"
          title={message}
          style={{
            marginTop: 2,
            marginLeft: 28,
            padding: "7px 9px",
            borderRadius: 7,
            background:
              state === "error" ? "var(--danger-soft)" : "var(--muted-bg)",
            color: state === "error" ? "var(--danger)" : "var(--ink-muted)",
            fontFamily: MONO,
            fontSize: 11,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </div>
      ) : null}
    </article>
  );
}

function RailCell({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        width: 20,
        display: "inline-flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {children}
    </span>
  );
}

function RailStep({
  label,
  enabled,
  note,
  children,
}: {
  label: string;
  enabled: boolean;
  note?: { text: string; tone?: "danger" };
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "20px minmax(0, 1fr)",
        gap: 8,
        padding: "5px 0",
      }}
    >
      <span
        style={{
          width: 20,
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: 4,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            boxSizing: "border-box",
            border: `1.5px solid ${enabled ? "var(--ink-faint)" : RAIL_MUTED}`,
            background: "var(--sheet-bg)",
          }}
        />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            lineHeight: "16px",
            color: "var(--ink)",
          }}
        >
          {label}
        </span>
        {children}
        {note ? (
          <span
            style={{
              fontSize: 11,
              lineHeight: 1.4,
              color:
                note.tone === "danger" ? "var(--danger)" : "var(--ink-faint)",
            }}
          >
            {note.text}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Recent PDFs                                                           */
/* ------------------------------------------------------------------ */

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
  const interactive = exists && !isCurrent;

  return (
    <div
      className={
        interactive
          ? "rtpdf-inspector__row rtpdf-inspector__row--interactive"
          : "rtpdf-inspector__row"
      }
      onClick={() => interactive && onSelect(entry.path)}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Watch ${entry.fileName}` : undefined}
      onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(entry.path);
        }
      }}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
        alignItems: "center",
        gap: 10,
        padding: "7px 6px 7px 12px",
        marginLeft: -12,
        marginRight: -8,
        borderRadius: 8,
        cursor: interactive ? "pointer" : "default",
        opacity: exists ? 1 : 0.6,
      }}
    >
      {isCurrent ? (
        // A separate bar rather than a border or inset shadow: those leave a
        // faint anti-aliased hairline around a rounded row in WebKit.
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 9,
            bottom: 9,
            width: 2,
            borderRadius: 1,
            background: "var(--accent)",
          }}
        />
      ) : null}
      <PdfChip exists={exists} size="sm" />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 7,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.fileName}
          </span>
          {isCurrent ? (
            <span
              style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0 }}
            >
              Watching now
            </span>
          ) : null}
          {!exists ? (
            <span
              style={{ fontSize: 11, color: "var(--danger)", flexShrink: 0 }}
            >
              Missing
            </span>
          ) : null}
        </div>
        <PathText path={entry.path} style={{ marginTop: 1, fontSize: 10.5 }} />
      </div>
      <div
        style={{
          textAlign: "right",
          fontSize: 11,
          lineHeight: "15px",
          color: "var(--ink-muted)",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div>{pluralize(entry.hooks.length, "hook")}</div>
        <div style={{ color: "var(--ink-faint)" }}>
          {formatLastOpenedRelative(entry.lastOpenedAt, nowMs)}
        </div>
      </div>
      <IconButton
        className="rtpdf-inspector__row-remove"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(entry.path);
        }}
        label={`Remove ${entry.fileName} from recents`}
        size={22}
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                            */
/* ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <header
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              lineHeight: "18px",
            }}
          >
            {title}
          </h3>
          {hint ? (
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--ink-muted)",
              }}
            >
              {hint}
            </p>
          ) : null}
        </div>
        {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "10px 12px",
        borderRadius: 8,
        background: "var(--muted-bg)",
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--ink-muted)",
      }}
    >
      {children}
    </p>
  );
}

function PdfChip({ exists, size }: { exists: boolean; size: "sm" | "lg" }) {
  const large = size === "lg";
  return (
    <span
      aria-hidden="true"
      style={{
        width: large ? 24 : 16,
        height: large ? 30 : 20,
        borderRadius: large ? 4 : 3,
        flexShrink: 0,
        marginTop: large ? 0 : 1,
        background: exists
          ? "linear-gradient(180deg, #ff8a7e 0%, #e3493b 100%)"
          : "var(--muted-bg)",
        color: exists ? "#fff" : "var(--ink-faint)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: large ? 7.5 : 6,
        fontWeight: 800,
        letterSpacing: 0.3,
        boxShadow: exists ? "inset 0 0.5px 0 rgba(255,255,255,0.4)" : "none",
      }}
    >
      PDF
    </span>
  );
}

// Shows the tail of a long path, which is the part that identifies it. The
// outer box is RTL so the ellipsis lands on the left; the inner span is LTR
// so slashes and tildes keep their places.
function PathText({ path, style }: { path: string; style?: CSSProperties }) {
  return (
    <div
      title={path}
      style={{
        fontFamily: MONO,
        color: "var(--ink-muted)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        direction: "rtl",
        textAlign: "left",
        ...style,
      }}
    >
      <span dir="ltr">{shrinkPath(path)}</span>
    </div>
  );
}

function StatusLine({ tone, text }: { tone: Tone; text: string }) {
  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        alignItems: "flex-start",
        gap: 7,
        fontSize: 12,
        lineHeight: "16px",
        color: tone.fg,
      }}
    >
      <StatusDot tone={tone} size={7} style={{ marginTop: 4.5 }} />
      <span>{text}</span>
    </div>
  );
}

function StatusDot({
  tone,
  size,
  style,
}: {
  tone: Tone;
  size: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: tone.dot,
        color: tone.dot,
        animation: tone.pulse ? "rtpdf-pulse 1.6s infinite" : "none",
        ...style,
      }}
    />
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 28,
        height: 16,
        borderRadius: 8,
        position: "relative",
        background: checked ? "var(--accent)" : "var(--muted-bg)",
        border: "0.5px solid rgba(0,0,0,0.1)",
        cursor: "pointer",
        padding: 0,
        transition: "background 160ms",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 1,
          left: checked ? 13 : 1,
          width: 13,
          height: 13,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
          transition: "left 160ms",
        }}
      />
    </button>
  );
}

function IconButton({
  onClick,
  label,
  size,
  className,
  children,
}: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  label: string;
  size: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        className
          ? `rtpdf-inspector__icon-button ${className}`
          : "rtpdf-inspector__icon-button"
      }
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        background: "transparent",
        color: "var(--ink-muted)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "background 120ms, color 120ms",
      }}
    >
      {children}
    </button>
  );
}

function PillButton({
  onClick,
  disabled,
  type = "button",
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rtpdf-inspector__pill"
      style={{
        padding: "0 12px",
        height: 30,
        borderRadius: 7,
        border: "0.5px solid var(--pill-border)",
        background: "var(--pill-bg)",
        color: "var(--ink)",
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
        transition: "background 120ms",
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 30,
  padding: "0 10px",
  borderRadius: 7,
  border: "0.5px solid var(--pill-border)",
  background: "var(--input-bg)",
  color: "var(--ink)",
  fontSize: 12,
  lineHeight: "16px",
  outline: "none",
  fontFamily: MONO,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 52,
  padding: "7px 10px",
  resize: "vertical",
};

const selectStyle: CSSProperties = {
  width: "100%",
  height: 30,
  padding: "0 10px",
  borderRadius: 7,
  border: "0.5px solid var(--pill-border)",
  background: "var(--input-bg)",
  color: "var(--ink)",
  fontSize: 12,
  outline: "none",
};

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
