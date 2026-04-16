"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import PdfViewer from "@/components/PdfViewer";
import {
  DEFAULT_HOOK_EXECUTION_PATH,
  DEFAULT_ZOOM,
  ZOOM_STEP,
  type HistoryPathStatus,
  type HookStatus,
  type HookRuntimeState,
  type WatchHistoryEntry,
  type WatchHook,
  appendRevision,
  clampZoom,
  removeWatchHistoryEntry,
  upsertWatchHistoryEntry,
  zoomPercentage,
} from "@/lib/pdf";

const PDF_WATCH_EVENT = "pdf-file-state";
const HOOK_STATUS_EVENT = "hook-status";
const SETTINGS_STORE_PATH = "settings.json";

type PdfSelection = {
  path: string;
  fileName: string;
  revision: number;
};

type PdfWatchEvent = PdfSelection & {
  status: "ready" | "updated" | "removed" | "error";
  message?: string | null;
};

type WatchSource = "picker" | "path" | "restore";

function buildViewerSrc(pdf: PdfSelection | null): string | null {
  if (!pdf) return null;

  const baseUrl = isTauri() ? convertFileSrc(pdf.path) : pdf.path;
  return appendRevision(baseUrl, pdf.revision);
}

function watchSourceMessage(selection: PdfSelection, source: WatchSource): string {
  if (source === "restore") {
    return `${selection.fileName} was restored and is being watched again.`;
  }

  if (source === "path") {
    return `${selection.fileName} is loaded from the typed path and is now being watched.`;
  }

  return `${selection.fileName} is loaded. Watching for filesystem changes now.`;
}

function createHookId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `hook-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyHook(): WatchHook {
  return {
    id: createHookId(),
    watchPath: "",
    command: "",
    executionPath: DEFAULT_HOOK_EXECUTION_PATH,
    enabled: true,
  };
}

function toRuntimeStatusMessage(state: HookRuntimeState): string {
  switch (state) {
    case "watching":
      return "Watching for source changes.";
    case "running":
      return "Command is running.";
    case "success":
      return "Last command completed successfully.";
    case "error":
      return "The last command failed.";
    case "disabled":
      return "Hook is disabled.";
    default:
      return "Hook is idle.";
  }
}

function hookStatusClassName(state: HookRuntimeState): string {
  if (state === "running") return "is-running";
  if (state === "success" || state === "watching") return "is-live";
  if (state === "error") return "is-error";
  return "is-idle";
}

export default function Home() {
  const storeRef = useRef<LazyStore | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<PdfSelection | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isWatchingPath, setIsWatchingPath] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCheckingHistory, setIsCheckingHistory] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>([]);
  const [historyStatuses, setHistoryStatuses] = useState<
    Record<string, HistoryPathStatus>
  >({});
  const [hookPathStatuses, setHookPathStatuses] = useState<
    Record<string, HistoryPathStatus>
  >({});
  const [hookStatuses, setHookStatuses] = useState<Record<string, HookStatus>>({});
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [copySourcePath, setCopySourcePath] = useState("");
  const [statusText, setStatusText] = useState(
    "Pick a PDF or reopen a saved watch path to start watching it.",
  );
  const [statusTone, setStatusTone] = useState<"live" | "idle" | "error">(
    "idle",
  );

  const viewerSrc = useMemo(() => buildViewerSrc(selectedPdf), [selectedPdf]);
  const zoomPercent = useMemo(() => zoomPercentage(zoom), [zoom]);
  const isBusy = isPicking || isWatchingPath;

  const currentHistoryEntry = useMemo(
    () =>
      selectedPdf
        ? watchHistory.find((entry) => entry.path === selectedPdf.path) ?? null
        : null,
    [selectedPdf, watchHistory],
  );

  const templateCandidates = useMemo(
    () =>
      watchHistory.filter(
        (entry) =>
          entry.path !== currentHistoryEntry?.path && entry.hooks.length > 0,
      ),
    [currentHistoryEntry?.path, watchHistory],
  );

  const ensureTauri = () => {
    if (isTauri()) return true;

    setStatusTone("error");
    setStatusText("Run this page inside Tauri so the app can access a local file path.");
    return false;
  };

  const getStore = async () => {
    if (!isTauri()) return null;

    if (!storeRef.current) {
      storeRef.current = new LazyStore(SETTINGS_STORE_PATH, {
        autoSave: 150,
        defaults: {
          watchPath: "",
          zoom: DEFAULT_ZOOM,
          watchHistory: [],
        },
      });
    }

    return storeRef.current;
  };

  const savePreference = async (key: string, value: unknown) => {
    try {
      const store = await getStore();
      await store?.set(key, value);
    } catch (error) {
      console.error(`[preferences] Failed to persist ${key}:`, error);
    }
  };

  const persistHistory = (
    updater: (current: WatchHistoryEntry[]) => WatchHistoryEntry[],
  ) => {
    setWatchHistory((current) => {
      const nextHistory = updater(current);
      void savePreference("watchHistory", nextHistory);
      return nextHistory;
    });
  };

  const updateCurrentHooks = (
    updater: (current: WatchHook[]) => WatchHook[],
  ) => {
    if (!selectedPdf) return;

    persistHistory((current) =>
      current.map((entry) =>
        entry.path === selectedPdf.path
          ? { ...entry, hooks: updater(entry.hooks) }
          : entry,
      ),
    );
  };

  const upsertHistory = (selection: PdfSelection) => {
    persistHistory((current) => {
      const existing = current.find((entry) => entry.path === selection.path);

      return upsertWatchHistoryEntry(current, {
        path: selection.path,
        fileName: selection.fileName,
        lastOpenedAt: new Date().toISOString(),
        hooks: existing?.hooks ?? [],
      });
    });
  };

  const handleLoadSelection = (result: PdfSelection, source: WatchSource) => {
    setSelectedPdf(result);
    setPathInput(result.path);
    setStatusTone("live");
    setStatusText(watchSourceMessage(result, source));
    setHistoryError(null);
    setIsSettingsOpen(false);
    void savePreference("watchPath", result.path);
    upsertHistory(result);
  };

  useEffect(() => {
    if (!isTauri()) return;

    let unlistenPdf: (() => void) | undefined;
    let unlistenHook: (() => void) | undefined;

    listen<PdfWatchEvent>(PDF_WATCH_EVENT, (event) => {
      const next = event.payload;

      setSelectedPdf((current) => {
        if (!current || current.path !== next.path) {
          return current;
        }

        return {
          path: next.path,
          fileName: next.fileName,
          revision: next.revision,
        };
      });
      setPathInput(next.path);

      if (next.status === "updated") {
        setStatusTone("live");
        setStatusText(`${next.fileName} reloaded from disk.`);
        return;
      }

      if (next.status === "removed") {
        setStatusTone("error");
        setStatusText(
          next.message || `${next.fileName} is missing. Restore the file to reload it.`,
        );
        setIsSettingsOpen(true);
        return;
      }

      if (next.status === "error") {
        setStatusTone("error");
        setStatusText(next.message || "The file watcher reported an error.");
        setIsSettingsOpen(true);
      }
    }).then((cleanup) => {
      unlistenPdf = cleanup;
    });

    listen<HookStatus>(HOOK_STATUS_EVENT, (event) => {
      const payload = event.payload;
      setHookStatuses((current) => ({
        ...current,
        [payload.hookId]: payload,
      }));
    }).then((cleanup) => {
      unlistenHook = cleanup;
    });

    return () => {
      void unlistenPdf?.();
      void unlistenHook?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;

    const restorePreferences = async () => {
      try {
        const store = await getStore();
        const [savedPath, savedZoom, savedHistory] = await Promise.all([
          store?.get<string>("watchPath"),
          store?.get<number>("zoom"),
          store?.get<WatchHistoryEntry[]>("watchHistory"),
        ]);

        if (cancelled) return;

        if (savedZoom !== undefined) {
          setZoom(clampZoom(savedZoom));
        }

        const normalizedHistory = (savedHistory ?? []).map((entry) => ({
          ...entry,
          hooks: (entry.hooks ?? []).map((hook) => ({
            id: hook.id || createHookId(),
            watchPath: hook.watchPath ?? "",
            command: hook.command ?? "",
            executionPath:
              hook.executionPath || DEFAULT_HOOK_EXECUTION_PATH,
            enabled: hook.enabled ?? true,
          })),
        }));

        setWatchHistory(normalizedHistory);

        if (savedPath) {
          setPathInput(savedPath);
          setStatusText("Restoring the saved PDF watch path...");

          try {
            const result = await invoke<PdfSelection>("watch_pdf_path", {
              path: savedPath,
            });

            if (cancelled) return;
            handleLoadSelection(result, "restore");
          } catch (error) {
            if (cancelled) return;

            setStatusTone("error");
            setStatusText(
              error instanceof Error
                ? error.message
                : "Unable to restore the saved PDF path.",
            );
            setIsSettingsOpen(true);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setStatusTone("error");
          setStatusText(
            error instanceof Error
              ? error.message
              : "Unable to restore saved viewer preferences.",
          );
        }
      } finally {
        if (!cancelled) {
          setPreferencesLoaded(true);
        }
      }
    };

    void restorePreferences();

    return () => {
      cancelled = true;
      const store = storeRef.current;
      storeRef.current = null;
      void store?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded || !isTauri()) return;
    void savePreference("zoom", zoom);
  }, [preferencesLoaded, zoom]);

  useEffect(() => {
    if (!preferencesLoaded || !isTauri()) return;

    const hooks = currentHistoryEntry?.hooks ?? [];
    const baseStatuses = Object.fromEntries(
      hooks.map((hook) => [
        hook.id,
        {
          hookId: hook.id,
          state: hook.enabled ? "watching" : "disabled",
          message: hook.enabled
            ? "Watching for source changes."
            : "Hook is disabled.",
        } satisfies HookStatus,
      ]),
    );
    setHookStatuses(baseStatuses);

    void invoke("set_active_hooks", { hooks }).catch((error) => {
      setStatusTone("error");
      setStatusText(
        error instanceof Error
          ? error.message
          : "Unable to configure active hooks.",
      );
    });
  }, [preferencesLoaded, currentHistoryEntry?.path, currentHistoryEntry?.hooks]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    if (watchHistory.length === 0) {
      setHistoryStatuses({});
      setHistoryError(null);
      return;
    }

    let cancelled = false;

    const refreshHistoryStatuses = async () => {
      setIsCheckingHistory(true);
      setHistoryError(null);

      try {
        const results = await invoke<HistoryPathStatus[]>("check_history_paths", {
          paths: watchHistory.map((entry) => entry.path),
          requirePdf: true,
        });

        if (cancelled) return;

        setHistoryStatuses(
          Object.fromEntries(results.map((entry) => [entry.path, entry])),
        );
      } catch (error) {
        if (cancelled) return;

        setHistoryError(
          error instanceof Error
            ? error.message
            : "Unable to refresh saved history availability.",
        );
      } finally {
        if (!cancelled) {
          setIsCheckingHistory(false);
        }
      }
    };

    void refreshHistoryStatuses();

    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen, watchHistory]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const hooks = currentHistoryEntry?.hooks ?? [];
    if (hooks.length === 0) {
      setHookPathStatuses({});
      return;
    }

    let cancelled = false;

    const refreshHookPathStatuses = async () => {
      try {
        const results = await invoke<HistoryPathStatus[]>("check_history_paths", {
          paths: hooks.map((hook) => hook.watchPath),
          requirePdf: false,
        });

        if (cancelled) return;

        setHookPathStatuses(
          Object.fromEntries(
            hooks.map((hook, index) => [
              hook.id,
              results[index] ?? {
                path: hook.watchPath,
                fileName: "",
                exists: false,
              },
            ]),
          ),
        );
      } catch (error) {
        if (cancelled) return;

        console.error("Failed to refresh hook path statuses:", error);
      }
    };

    void refreshHookPathStatuses();

    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen, currentHistoryEntry?.path, currentHistoryEntry?.hooks]);

  const handleSelectPdf = async () => {
    if (!ensureTauri()) return;

    setIsPicking(true);

    try {
      const result = await invoke<PdfSelection | null>("pick_pdf_path");

      if (!result) {
        setStatusTone(selectedPdf ? "live" : "idle");
        setStatusText(
          selectedPdf
            ? "Selection cancelled. The current watcher is still active."
            : "Selection cancelled.",
        );
        return;
      }

      handleLoadSelection(result, "picker");
    } catch (error) {
      setStatusTone("error");
      setStatusText(
        error instanceof Error
          ? error.message
          : "Unable to select or watch the PDF file.",
      );
    } finally {
      setIsPicking(false);
    }
  };

  const handleWatchPath = async (path: string) => {
    if (!ensureTauri()) return;

    setIsWatchingPath(true);

    try {
      const result = await invoke<PdfSelection>("watch_pdf_path", {
        path,
      });
      handleLoadSelection(result, "path");
    } catch (error) {
      setStatusTone("error");
      setStatusText(
        error instanceof Error
          ? error.message
          : "Unable to watch the PDF at that path.",
      );
    } finally {
      setIsWatchingPath(false);
    }
  };

  const handlePathSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleWatchPath(pathInput);
  };

  const handleZoom = (direction: "in" | "out") => {
    const delta = direction === "in" ? ZOOM_STEP : -ZOOM_STEP;
    setZoom((current) => clampZoom(current + delta));
  };

  const handleRemoveHistoryEntry = async (path: string) => {
    persistHistory((current) => removeWatchHistoryEntry(current, path));
    setHistoryStatuses((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });

    if (selectedPdf?.path === path) {
      await savePreference("watchPath", "");
      setStatusTone("idle");
      setStatusText(
        `${selectedPdf.fileName} is still open in this session, but it will not auto-restore next time.`,
      );
    }
  };

  const handleSelectHistoryEntry = async (path: string) => {
    setPathInput(path);
    await handleWatchPath(path);
  };

  const handleAddHook = () => {
    updateCurrentHooks((current) => [...current, createEmptyHook()]);
  };

  const handleUpdateHook = (hookId: string, patch: Partial<WatchHook>) => {
    updateCurrentHooks((current) =>
      current.map((hook) =>
        hook.id === hookId ? { ...hook, ...patch } : hook,
      ),
    );
  };

  const handleRemoveHook = (hookId: string) => {
    updateCurrentHooks((current) => current.filter((hook) => hook.id !== hookId));
    setHookPathStatuses((current) => {
      const next = { ...current };
      delete next[hookId];
      return next;
    });
    setHookStatuses((current) => {
      const next = { ...current };
      delete next[hookId];
      return next;
    });
  };

  const handleCopyHooksFromTemplate = () => {
    if (!currentHistoryEntry || !copySourcePath) return;

    const source = watchHistory.find((entry) => entry.path === copySourcePath);
    if (!source || source.hooks.length === 0) return;

    const clonedHooks = source.hooks.map((hook) => ({
      ...hook,
      id: createHookId(),
    }));

    updateCurrentHooks((current) => [...current, ...clonedHooks]);
    setCopySourcePath("");
    setStatusTone("idle");
    setStatusText(
      `Copied ${clonedHooks.length} hook${clonedHooks.length === 1 ? "" : "s"} from ${source.fileName}.`,
    );
  };

  return (
    <main className="app-shell">
      <section className="viewer-layer">
        {viewerSrc ? (
          <div className="viewer-viewport">
            <PdfViewer
              src={viewerSrc}
              zoom={zoom}
              onLoadError={(error) => {
                setStatusTone("error");
                setStatusText(
                  error.message || "The PDF viewer could not load the selected file.",
                );
              }}
              onZoomChange={(nextZoom) => {
                setZoom((current) => {
                  const clamped = clampZoom(nextZoom);
                  return Math.abs(current - clamped) < 0.001 ? current : clamped;
                });
              }}
            />
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-card">
              <span className="eyebrow">Realtime PDF</span>
              <h1>Open one watched PDF.</h1>
              <p>
                Use the floating settings button to choose the path. The app
                restores your saved path and keeps a removable history list.
              </p>
              <button
                className="primary-button"
                onClick={() => setIsSettingsOpen(true)}
                type="button"
              >
                Open settings
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="viewer-badge panel">
        <div className="viewer-badge__title">
          {selectedPdf?.fileName || "No PDF selected"}
        </div>
        <div className="viewer-badge__meta">
          <span
            className={[
              "status-pill",
              statusTone === "live"
                ? "is-live"
                : statusTone === "error"
                  ? "is-error"
                  : "is-idle",
            ].join(" ")}
          >
            {statusTone === "live"
              ? "Watching"
              : statusTone === "error"
                ? "Attention"
                : "Idle"}
          </span>
          <span className="viewer-badge__message">{statusText}</span>
        </div>
      </div>

      <button
        aria-expanded={isSettingsOpen}
        className="settings-fab"
        onClick={() => setIsSettingsOpen(true)}
        type="button"
      >
        <span aria-hidden="true">⚙</span>
        <span>Settings</span>
      </button>

      <div className="zoom-toolbar panel" role="toolbar" aria-label="PDF zoom controls">
        <button
          className="zoom-button"
          disabled={!selectedPdf}
          onClick={() => handleZoom("out")}
          type="button"
        >
          -
        </button>
        <div className="zoom-label">{zoomPercent}%</div>
        <button
          className="zoom-button"
          disabled={!selectedPdf}
          onClick={() => handleZoom("in")}
          type="button"
        >
          +
        </button>
      </div>

      {isSettingsOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setIsSettingsOpen(false)}
          role="presentation"
        >
          <section
            aria-modal="true"
            className="modal-card panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Settings</span>
                <h2>Choose the watched PDF</h2>
                <p>
                  The saved path restores on reopen. Saved history stays until you
                  remove it.
                </p>
              </div>
              <button
                aria-label="Close settings"
                className="icon-button"
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                x
              </button>
            </div>

            <div className="modal-actions">
              <button
                className="primary-button"
                disabled={isBusy}
                onClick={handleSelectPdf}
                type="button"
              >
                {isPicking ? "Opening native picker..." : "Pick PDF"}
              </button>
            </div>

            <form className="path-form" onSubmit={handlePathSubmit}>
              <label className="path-label" htmlFor="pdf-path-input">
                Watched PDF path
              </label>
              <div className="path-row">
                <input
                  id="pdf-path-input"
                  className="path-input"
                  onChange={(event) => setPathInput(event.target.value)}
                  placeholder="/absolute/path/to/file.pdf"
                  spellCheck={false}
                  type="text"
                  value={pathInput}
                />
                <button
                  className="secondary-button"
                  disabled={isBusy}
                  type="submit"
                >
                  {isWatchingPath ? "Watching..." : "Save and watch"}
                </button>
              </div>
              <p className="path-help">
                Supports pasted absolute paths. <code>~/...</code> is expanded on
                the Rust side.
              </p>
            </form>

            {currentHistoryEntry ? (
              <div className="meta-card modal-meta">
                <div className="hook-header">
                  <div>
                    <h3>Hooks for {currentHistoryEntry.fileName}</h3>
                    <p>
                      Only the active PDF&apos;s hooks run. A hook watches a source
                      path and runs a command in an execution path.
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={handleAddHook}
                    type="button"
                  >
                    Add hook
                  </button>
                </div>

                {templateCandidates.length > 0 ? (
                  <div className="hook-template-row">
                    <select
                      className="hook-template-select"
                      onChange={(event) => setCopySourcePath(event.target.value)}
                      value={copySourcePath}
                    >
                      <option value="">Copy hooks from another PDF...</option>
                      {templateCandidates.map((entry) => (
                        <option key={entry.path} value={entry.path}>
                          {entry.fileName} ({entry.hooks.length})
                        </option>
                      ))}
                    </select>
                    <button
                      className="secondary-button"
                      disabled={!copySourcePath}
                      onClick={handleCopyHooksFromTemplate}
                      type="button"
                    >
                      Copy hooks
                    </button>
                  </div>
                ) : null}

                {currentHistoryEntry.hooks.length > 0 ? (
                  <div className="hook-list">
                    {currentHistoryEntry.hooks.map((hook, index) => {
                      const runtimeStatus = hookStatuses[hook.id];
                      const pathStatus = hookPathStatuses[hook.id];
                      const runtimeState = runtimeStatus?.state ?? (hook.enabled ? "watching" : "disabled");
                      const runtimeMessage =
                        runtimeStatus?.message ?? toRuntimeStatusMessage(runtimeState);

                      return (
                        <div className="hook-card" key={hook.id}>
                          <div className="hook-card__header">
                            <div className="hook-card__title">Hook {index + 1}</div>
                            <div className="hook-card__meta">
                              <span
                                className={[
                                  "status-pill",
                                  hookStatusClassName(runtimeState),
                                ].join(" ")}
                              >
                                {runtimeState}
                              </span>
                              <label className="hook-toggle">
                                <input
                                  checked={hook.enabled}
                                  onChange={(event) =>
                                    handleUpdateHook(hook.id, {
                                      enabled: event.target.checked,
                                    })
                                  }
                                  type="checkbox"
                                />
                                <span>Enabled</span>
                              </label>
                              <button
                                className="icon-button history-remove"
                                onClick={() => handleRemoveHook(hook.id)}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          <div className="hook-fields">
                            <label className="path-label">
                              Watch path
                              <input
                                className="path-input"
                                onChange={(event) =>
                                  handleUpdateHook(hook.id, {
                                    watchPath: event.target.value,
                                  })
                                }
                                placeholder="/path/to/source.blade.php"
                                spellCheck={false}
                                type="text"
                                value={hook.watchPath}
                              />
                            </label>

                            <label className="path-label">
                              Execution path
                              <input
                                className="path-input"
                                onChange={(event) =>
                                  handleUpdateHook(hook.id, {
                                    executionPath: event.target.value,
                                  })
                                }
                                placeholder="~"
                                spellCheck={false}
                                type="text"
                                value={hook.executionPath}
                              />
                            </label>

                            <label className="path-label">
                              Execute command
                              <textarea
                                className="hook-command"
                                onChange={(event) =>
                                  handleUpdateHook(hook.id, {
                                    command: event.target.value,
                                  })
                                }
                                placeholder="php artisan test --filter=GeneratePdfTest"
                                rows={3}
                                spellCheck={false}
                                value={hook.command}
                              />
                            </label>
                          </div>

                          <div className="hook-card__footer">
                            <span
                              className={[
                                "status-pill",
                                (pathStatus?.exists ?? false) ? "is-live" : "is-error",
                              ].join(" ")}
                            >
                              {(pathStatus?.exists ?? false) ? "Source available" : "Source missing"}
                            </span>
                            <span className="hook-runtime-message">{runtimeMessage}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="history-empty">
                    No hooks yet. Add one to watch a source file and regenerate
                    this PDF automatically.
                  </p>
                )}
              </div>
            ) : (
              <div className="meta-card modal-meta">
                <h3>Hooks</h3>
                <p className="history-empty">
                  Watch a PDF first, then its hooks can be configured here.
                </p>
              </div>
            )}

            <div className="meta-card modal-meta">
              <div className="history-header">
                <div>
                  <h3>Saved history</h3>
                  <p>
                    Missing files stay listed but cannot be selected until they
                    exist again.
                  </p>
                </div>
                {isCheckingHistory ? (
                  <span className="history-checking">Checking paths...</span>
                ) : null}
              </div>

              {historyError ? (
                <p className="history-error">{historyError}</p>
              ) : null}

              {watchHistory.length > 0 ? (
                <div className="history-list">
                  {watchHistory.map((entry) => {
                    const status = historyStatuses[entry.path];
                    const isCurrent = selectedPdf?.path === entry.path;
                    const exists = status?.exists ?? false;

                    return (
                      <div
                        className={[
                          "history-item",
                          isCurrent ? "is-current" : "",
                          !exists ? "is-missing" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={entry.path}
                      >
                        <div className="history-item__body">
                          <div className="history-item__title">{entry.fileName}</div>
                          <div className="history-item__path">{entry.path}</div>
                        </div>
                        <div className="history-item__meta">
                          <span
                            className={[
                              "status-pill",
                              exists ? "is-live" : "is-error",
                            ].join(" ")}
                          >
                            {exists ? "Available" : "Missing"}
                          </span>
                          <span className="history-count">
                            {entry.hooks.length} hook{entry.hooks.length === 1 ? "" : "s"}
                          </span>
                          {isCurrent ? (
                            <span className="history-current">Current</span>
                          ) : (
                            <button
                              className="secondary-button history-action"
                              disabled={isBusy || !exists}
                              onClick={() => {
                                void handleSelectHistoryEntry(entry.path);
                              }}
                              type="button"
                            >
                              Use
                            </button>
                          )}
                          <button
                            className="icon-button history-remove"
                            onClick={() => {
                              void handleRemoveHistoryEntry(entry.path);
                            }}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="history-empty">
                  No saved history yet. Successfully watched files will appear
                  here.
                </p>
              )}
            </div>

            <div className="meta-card modal-meta">
              <h3>Current session</h3>
              {selectedPdf ? (
                <dl className="meta-list">
                  <div className="meta-row">
                    <dt>Name</dt>
                    <dd>{selectedPdf.fileName}</dd>
                  </div>
                  <div className="meta-row">
                    <dt>Path</dt>
                    <dd>{selectedPdf.path}</dd>
                  </div>
                  <div className="meta-row">
                    <dt>Zoom</dt>
                    <dd>{zoomPercent}%</dd>
                  </div>
                </dl>
              ) : (
                <p>No active PDF yet.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
