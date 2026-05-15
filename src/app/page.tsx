"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LazyStore } from "@tauri-apps/plugin-store";
import HookDock from "@/components/HookDock";
import PdfViewer from "@/components/PdfViewer";
import RecentsDropdown from "@/components/RecentsDropdown";
import {
  AmbientReloadIndicator,
  ReloadToast,
} from "@/components/ReloadToast";
import SettingsSheet from "@/components/SettingsSheet";
import Toolbar, { type ToolbarStatusTone } from "@/components/Toolbar";
import UpdateChecker from "@/components/UpdateChecker";
import {
  DEFAULT_HOOK_EXECUTION_PATH,
  DEFAULT_ZOOM,
  ZERO_SCROLL_OFFSET,
  ZOOM_STEP,
  appendRevision,
  clampZoom,
  normalizeScrollOffset,
  removeWatchHistoryEntry,
  upsertWatchHistoryEntry,
  zoomPercentage,
  type HistoryPathStatus,
  type HookStatus,
  type ScrollOffset,
  type WatchHistoryEntry,
  type WatchHook,
} from "@/lib/pdf";
import {
  formatRelativeReload,
  isTheme,
  themeVars,
  type Theme,
} from "@/lib/theme";

const PDF_WATCH_EVENT = "pdf-file-state";
const HOOK_STATUS_EVENT = "hook-status";
const HISTORY_PATH_EVENT = "history-path-status";
const SETTINGS_STORE_PATH = "settings.json";
const SCROLL_OFFSET_SAVE_DELAY_MS = 200;
const RELOAD_TOAST_VISIBLE_MS = 2400;
const TICK_INTERVAL_MS = 5000;

type PdfSelection = {
  path: string;
  fileName: string;
  revision: number;
  lastModifiedMs: number | null;
};

type PdfWatchEvent = Pick<PdfSelection, "path" | "fileName" | "revision"> & {
  status: "ready" | "updated" | "removed" | "error";
  message?: string | null;
};

type WatchSource = "picker" | "path" | "restore";

function buildViewerSrc(pdf: PdfSelection | null): string | null {
  if (!pdf) return null;
  const baseUrl = isTauri() ? convertFileSrc(pdf.path) : pdf.path;
  return appendRevision(baseUrl, pdf.revision);
}

function watchSourceMessage(
  selection: PdfSelection,
  source: WatchSource,
): string {
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

export default function Home() {
  const storeRef = useRef<LazyStore | null>(null);
  const scrollPersistTimerRef = useRef<number | null>(null);
  const pendingScrollPathRef = useRef<string | null>(null);
  const pendingScrollOffsetRef = useRef<ScrollOffset | null>(null);
  const reloadToastTimerRef = useRef<number | null>(null);

  const [selectedPdf, setSelectedPdf] = useState<PdfSelection | null>(null);
  const [isTauriClient, setIsTauriClient] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isWatchingPath, setIsWatchingPath] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [hookDockExpanded, setHookDockExpanded] = useState(false);
  const [reloadToastVisible, setReloadToastVisible] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [isCheckingHistory, setIsCheckingHistory] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>([]);
  const [savedScrollOffsets, setSavedScrollOffsets] = useState<
    Record<string, ScrollOffset>
  >({});
  const [historyStatuses, setHistoryStatuses] = useState<
    Record<string, HistoryPathStatus>
  >({});
  const [hookPathStatuses, setHookPathStatuses] = useState<
    Record<string, HistoryPathStatus>
  >({});
  const [hookStatuses, setHookStatuses] = useState<
    Record<string, HookStatus>
  >({});
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [copySourcePath, setCopySourcePath] = useState("");
  const [statusText, setStatusText] = useState(
    "Pick a PDF or reopen a saved watch path to start watching it.",
  );
  const [lastReloadedAt, setLastReloadedAt] = useState<number | null>(null);
  const [statusTone, setStatusTone] = useState<ToolbarStatusTone>("idle");
  const [tickNow, setTickNow] = useState(() => Date.now());

  const viewerSrc = useMemo(() => buildViewerSrc(selectedPdf), [selectedPdf]);
  const zoomPercent = useMemo(() => zoomPercentage(zoom), [zoom]);
  const reloadAgoLabel = useMemo(
    () =>
      lastReloadedAt === null
        ? "Last reload —"
        : `Last reload ${formatRelativeReload(lastReloadedAt, tickNow)}`,
    [lastReloadedAt, tickNow],
  );
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

  const statusLabel = useMemo(() => {
    if (statusTone === "live") return "Watching";
    if (statusTone === "error") return "Attention";
    if (statusTone === "running") return "Running";
    return "Idle";
  }, [statusTone]);

  useEffect(() => {
    setIsTauriClient(isTauri());
  }, []);

  useEffect(() => {
    document.body.classList.toggle("rtpdf-dark", theme === "dark");
    return () => {
      document.body.classList.remove("rtpdf-dark");
    };
  }, [theme]);

  useEffect(() => {
    const t = window.setInterval(
      () => setTickNow(Date.now()),
      TICK_INTERVAL_MS,
    );
    return () => window.clearInterval(t);
  }, []);

  const ensureTauri = useCallback(() => {
    if (isTauri()) return true;
    setStatusTone("error");
    setStatusText(
      "Run this page inside Tauri so the app can access a local file path.",
    );
    return false;
  }, []);

  const getStore = useCallback(async () => {
    if (!isTauri()) return null;

    if (!storeRef.current) {
      storeRef.current = new LazyStore(SETTINGS_STORE_PATH, {
        autoSave: 150,
        defaults: {
          watchPath: "",
          zoom: DEFAULT_ZOOM,
          watchHistory: [],
          scrollOffsets: {},
          theme: "light",
        },
      });
    }

    return storeRef.current;
  }, []);

  const savePreference = useCallback(
    async (key: string, value: unknown) => {
      try {
        const store = await getStore();
        await store?.set(key, value);
      } catch (error) {
        console.error(`[preferences] Failed to persist ${key}:`, error);
      }
    },
    [getStore],
  );

  const persistHistory = useCallback(
    (updater: (current: WatchHistoryEntry[]) => WatchHistoryEntry[]) => {
      setWatchHistory((current) => {
        const nextHistory = updater(current);
        void savePreference("watchHistory", nextHistory);
        return nextHistory;
      });
    },
    [savePreference],
  );

  const persistScrollOffsets = useCallback(
    (
      updater: (
        current: Record<string, ScrollOffset>,
      ) => Record<string, ScrollOffset>,
    ) => {
      setSavedScrollOffsets((current) => {
        const nextOffsets = updater(current);
        if (nextOffsets === current) return current;
        void savePreference("scrollOffsets", nextOffsets);
        return nextOffsets;
      });
    },
    [savePreference],
  );

  const flushPendingScrollOffset = useCallback(() => {
    if (scrollPersistTimerRef.current !== null) {
      window.clearTimeout(scrollPersistTimerRef.current);
      scrollPersistTimerRef.current = null;
    }

    const path = pendingScrollPathRef.current;
    const offset = pendingScrollOffsetRef.current;
    pendingScrollPathRef.current = null;
    pendingScrollOffsetRef.current = null;

    if (!path || !offset) return;

    persistScrollOffsets((current) => {
      const previous = current[path];
      if (previous && previous.x === offset.x && previous.y === offset.y) {
        return current;
      }
      return { ...current, [path]: offset };
    });
  }, [persistScrollOffsets]);

  const scheduleScrollOffsetPersist = useCallback(
    (path: string, offset: ScrollOffset) => {
      if (
        pendingScrollPathRef.current !== null &&
        pendingScrollPathRef.current !== path
      ) {
        flushPendingScrollOffset();
      }

      pendingScrollPathRef.current = path;
      pendingScrollOffsetRef.current = normalizeScrollOffset(offset);

      if (scrollPersistTimerRef.current !== null) {
        window.clearTimeout(scrollPersistTimerRef.current);
      }

      scrollPersistTimerRef.current = window.setTimeout(() => {
        flushPendingScrollOffset();
      }, SCROLL_OFFSET_SAVE_DELAY_MS);
    },
    [flushPendingScrollOffset],
  );

  const updateCurrentHooks = useCallback(
    (updater: (current: WatchHook[]) => WatchHook[]) => {
      if (!selectedPdf) return;

      persistHistory((current) =>
        current.map((entry) =>
          entry.path === selectedPdf.path
            ? { ...entry, hooks: updater(entry.hooks) }
            : entry,
        ),
      );
    },
    [persistHistory, selectedPdf],
  );

  const upsertHistory = useCallback(
    (selection: PdfSelection) => {
      persistHistory((current) => {
        const existing = current.find(
          (entry) => entry.path === selection.path,
        );
        return upsertWatchHistoryEntry(current, {
          path: selection.path,
          fileName: selection.fileName,
          lastOpenedAt: new Date().toISOString(),
          hooks: existing?.hooks ?? [],
        });
      });
    },
    [persistHistory],
  );

  const showReloadToast = useCallback(() => {
    setReloadToastVisible(true);

    if (reloadToastTimerRef.current !== null) {
      window.clearTimeout(reloadToastTimerRef.current);
    }
    reloadToastTimerRef.current = window.setTimeout(() => {
      setReloadToastVisible(false);
      reloadToastTimerRef.current = null;
    }, RELOAD_TOAST_VISIBLE_MS);
  }, []);

  const handleLoadSelection = useCallback(
    (result: PdfSelection, source: WatchSource) => {
      flushPendingScrollOffset();
      setSelectedPdf(result);
      setPathInput(result.path);
      setStatusTone("live");
      setStatusText(watchSourceMessage(result, source));
      setLastReloadedAt(result.lastModifiedMs);
      setHistoryError(null);
      setIsSettingsOpen(false);
      setRecentsOpen(false);
      void savePreference("watchPath", result.path);
      upsertHistory(result);
    },
    [flushPendingScrollOffset, savePreference, upsertHistory],
  );

  useEffect(() => {
    if (!isTauri()) return;

    let unlistenPdf: (() => void) | undefined;
    let unlistenHook: (() => void) | undefined;

    listen<PdfWatchEvent>(PDF_WATCH_EVENT, (event) => {
      const next = event.payload;

      setSelectedPdf((current) => {
        if (!current || current.path !== next.path) return current;
        return {
          path: next.path,
          fileName: next.fileName,
          revision: next.revision,
          lastModifiedMs: current.lastModifiedMs,
        };
      });
      setPathInput(next.path);

      if (next.status === "updated") {
        setStatusTone("live");
        setStatusText(`${next.fileName} reloaded from disk.`);
        setLastReloadedAt(Date.now());
        showReloadToast();
        return;
      }

      if (next.status === "removed") {
        setStatusTone("error");
        setStatusText(
          next.message ||
            `${next.fileName} is missing. Restore the file to reload it.`,
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
  }, [showReloadToast]);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;

    const restorePreferences = async () => {
      try {
        const store = await getStore();
        const [savedPath, savedZoom, savedHistory, storedScrollOffsets, savedTheme] =
          await Promise.all([
            store?.get<string>("watchPath"),
            store?.get<number>("zoom"),
            store?.get<WatchHistoryEntry[]>("watchHistory"),
            store?.get<Record<string, ScrollOffset>>("scrollOffsets"),
            store?.get<string>("theme"),
          ]);

        if (cancelled) return;

        if (savedZoom !== undefined) {
          setZoom(clampZoom(savedZoom));
        }

        if (isTheme(savedTheme)) {
          setTheme(savedTheme);
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
        setSavedScrollOffsets(
          Object.fromEntries(
            Object.entries(storedScrollOffsets ?? {}).map(([path, offset]) => [
              path,
              normalizeScrollOffset(offset),
            ]),
          ),
        );

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
      flushPendingScrollOffset();
      const store = storeRef.current;
      storeRef.current = null;
      void store?.close().catch(() => {});

      if (reloadToastTimerRef.current !== null) {
        window.clearTimeout(reloadToastTimerRef.current);
        reloadToastTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preferencesLoaded || !isTauri()) return;
    void savePreference("zoom", zoom);
  }, [preferencesLoaded, zoom, savePreference]);

  useEffect(() => {
    if (!preferencesLoaded || !isTauri()) return;
    void savePreference("theme", theme);
  }, [preferencesLoaded, theme, savePreference]);

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
  }, [
    preferencesLoaded,
    currentHistoryEntry?.path,
    currentHistoryEntry?.hooks,
  ]);

  const historyPathsKey = useMemo(
    () => [...watchHistory.map((entry) => entry.path)].sort().join("\n"),
    [watchHistory],
  );

  useEffect(() => {
    if (!isTauri()) return;

    const paths = watchHistory.map((entry) => entry.path);

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const run = async () => {
      setIsCheckingHistory(true);
      setHistoryError(null);

      try {
        unlisten = await listen<HistoryPathStatus>(
          HISTORY_PATH_EVENT,
          (event) => {
            if (cancelled) return;
            const { path, fileName, exists } = event.payload;
            setHistoryStatuses((current) => {
              const previous = current[path];
              if (previous && previous.exists === exists) return current;
              return {
                ...current,
                [path]: { path, fileName, exists },
              };
            });
          },
        );

        if (cancelled) {
          void unlisten();
          return;
        }

        if (paths.length === 0) {
          await invoke("set_history_watchers", { paths: [] });
          if (!cancelled) {
            setHistoryStatuses({});
          }
          return;
        }

        await invoke("set_history_watchers", { paths });
      } catch (error) {
        if (cancelled) return;
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Unable to refresh saved history availability.",
        );
      } finally {
        if (!cancelled) setIsCheckingHistory(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      void unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPathsKey]);

  useEffect(() => {
    if (!isTauri()) return;
    if (!recentsOpen && !isSettingsOpen) return;
    if (watchHistory.length === 0) return;

    const paths = watchHistory.map((entry) => entry.path);
    void invoke("set_history_watchers", { paths }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentsOpen, isSettingsOpen, historyPathsKey]);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const attach = async () => {
      try {
        unlisten = await getCurrentWebviewWindow().listen<unknown>(
          "tauri://focus",
          () => {
            if (cancelled) return;
            const paths = watchHistory.map((entry) => entry.path);
            if (paths.length === 0) return;
            void invoke("set_history_watchers", { paths }).catch(() => {});
          },
        );
        if (cancelled) {
          void unlisten();
        }
      } catch {
        // Window focus event unavailable in this runtime; skip silently.
      }
    };

    void attach();

    return () => {
      cancelled = true;
      void unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPathsKey]);

  useEffect(() => {
    if (!isTauri()) return;

    const hooks = currentHistoryEntry?.hooks ?? [];
    if (hooks.length === 0) {
      setHookPathStatuses({});
      return;
    }

    let cancelled = false;

    const refreshHookPathStatuses = async () => {
      try {
        const results = await invoke<HistoryPathStatus[]>(
          "check_history_paths",
          {
            paths: hooks.map((hook) => hook.watchPath),
            requirePdf: false,
          },
        );

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
  }, [currentHistoryEntry?.path, currentHistoryEntry?.hooks]);

  const handleSelectPdf = useCallback(async () => {
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
  }, [ensureTauri, handleLoadSelection, selectedPdf]);

  const handleWatchPath = useCallback(
    async (path: string) => {
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
    },
    [ensureTauri, handleLoadSelection],
  );

  const handlePathSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await handleWatchPath(pathInput);
    },
    [handleWatchPath, pathInput],
  );

  const handleZoom = useCallback((direction: -1 | 1) => {
    setZoom((current) => clampZoom(current + direction * ZOOM_STEP));
  }, []);

  const handleZoomFit = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, []);

  const handleRemoveHistoryEntry = useCallback(
    async (path: string) => {
      if (pendingScrollPathRef.current === path) {
        pendingScrollPathRef.current = null;
        pendingScrollOffsetRef.current = null;
        if (scrollPersistTimerRef.current !== null) {
          window.clearTimeout(scrollPersistTimerRef.current);
          scrollPersistTimerRef.current = null;
        }
      }

      persistHistory((current) => removeWatchHistoryEntry(current, path));
      persistScrollOffsets((current) => {
        if (!(path in current)) return current;
        const nextOffsets = { ...current };
        delete nextOffsets[path];
        return nextOffsets;
      });
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
    },
    [persistHistory, persistScrollOffsets, savePreference, selectedPdf],
  );

  const handleSelectHistoryEntry = useCallback(
    async (path: string) => {
      setPathInput(path);
      setRecentsOpen(false);
      await handleWatchPath(path);
    },
    [handleWatchPath],
  );

  const handleAddHook = useCallback(() => {
    updateCurrentHooks((current) => [...current, createEmptyHook()]);
    setIsSettingsOpen(true);
  }, [updateCurrentHooks]);

  const handleUpdateHook = useCallback(
    (hookId: string, patch: Partial<WatchHook>) => {
      updateCurrentHooks((current) =>
        current.map((hook) =>
          hook.id === hookId ? { ...hook, ...patch } : hook,
        ),
      );
    },
    [updateCurrentHooks],
  );

  const handleRemoveHook = useCallback(
    (hookId: string) => {
      updateCurrentHooks((current) =>
        current.filter((hook) => hook.id !== hookId),
      );
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
    },
    [updateCurrentHooks],
  );

  const handleToggleHook = useCallback(
    (hookId: string, nextEnabled: boolean) => {
      handleUpdateHook(hookId, { enabled: nextEnabled });
    },
    [handleUpdateHook],
  );

  const handleCopyHooksFromTemplate = useCallback(() => {
    if (!currentHistoryEntry || !copySourcePath) return;

    const source = watchHistory.find(
      (entry) => entry.path === copySourcePath,
    );
    if (!source || source.hooks.length === 0) return;

    const clonedHooks = source.hooks.map((hook) => ({
      ...hook,
      id: createHookId(),
    }));

    updateCurrentHooks((current) => [...current, ...clonedHooks]);
    setCopySourcePath("");
    setStatusTone("idle");
    setStatusText(
      `Copied ${clonedHooks.length} hook${
        clonedHooks.length === 1 ? "" : "s"
      } from ${source.fileName}.`,
    );
  }, [
    copySourcePath,
    currentHistoryEntry,
    updateCurrentHooks,
    watchHistory,
  ]);

  const handleToggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const handleToggleHookDock = useCallback(() => {
    setHookDockExpanded((current) => !current);
  }, []);

  const handleOpenRecentsPicker = useCallback(() => {
    setRecentsOpen(false);
    void handleSelectPdf();
  }, [handleSelectPdf]);

  const [dockHeight, setDockHeight] = useState(0);
  const dockVisible = Boolean(currentHistoryEntry);

  useEffect(() => {
    if (!dockVisible) {
      setDockHeight(0);
      return;
    }

    const root = document.querySelector<HTMLElement>(
      "[data-rtpdf-hook-dock]",
    );
    if (!root) return;

    const update = () => setDockHeight(root.offsetHeight);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [dockVisible, hookDockExpanded]);

  const ambientBottomOffset = dockVisible ? dockHeight + 24 : 24;

  return (
    <main
      className="rtpdf-app-shell"
      style={themeVars(theme)}
      data-theme={theme}
    >
      <Toolbar
        fileName={selectedPdf?.fileName ?? null}
        fileWatching={Boolean(selectedPdf)}
        recentsOpen={recentsOpen}
        onToggleRecents={() => setRecentsOpen((current) => !current)}
        recentsCount={watchHistory.length}
        zoomPercent={zoomPercent}
        onZoom={handleZoom}
        onFit={handleZoomFit}
        zoomDisabled={!selectedPdf}
        showStatusPill={true}
        statusTone={statusTone}
        statusLabel={statusLabel}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        recentsSlot={
          <RecentsDropdown
            open={recentsOpen}
            history={watchHistory}
            currentPath={selectedPdf?.path ?? null}
            historyStatuses={historyStatuses}
            nowMs={tickNow}
            onSelect={(path) => void handleSelectHistoryEntry(path)}
            onPickNew={handleOpenRecentsPicker}
            onClose={() => setRecentsOpen(false)}
          />
        }
      />

      <div className="rtpdf-canvas">
        {viewerSrc ? (
          <div className="rtpdf-canvas__viewer">
            <PdfViewer
              src={viewerSrc}
              initialScrollOffset={
                selectedPdf
                  ? savedScrollOffsets[selectedPdf.path] ?? ZERO_SCROLL_OFFSET
                  : ZERO_SCROLL_OFFSET
              }
              zoom={zoom}
              onLoadError={(error) => {
                setStatusTone("error");
                setStatusText(
                  error.message ||
                    "The PDF viewer could not load the selected file.",
                );
              }}
              onZoomChange={(nextZoom) => {
                setZoom((current) => {
                  const clamped = clampZoom(nextZoom);
                  return Math.abs(current - clamped) < 0.001
                    ? current
                    : clamped;
                });
              }}
              onScrollChange={(offset) => {
                if (!selectedPdf) return;
                scheduleScrollOffsetPersist(selectedPdf.path, offset);
              }}
            />
          </div>
        ) : (
          <div className="rtpdf-empty">
            <div className="rtpdf-empty__card">
              <span className="rtpdf-eyebrow">Realtime PDF</span>
              <h1>Open one watched PDF.</h1>
              <p>
                Pick a file or paste an absolute path. The app restores your
                last watched PDF on reopen and runs per-PDF source hooks when
                their watch paths change.
              </p>
              <button
                className="rtpdf-empty__cta"
                onClick={() => setIsSettingsOpen(true)}
                type="button"
              >
                Open settings
              </button>
            </div>
          </div>
        )}

        <ReloadToast
          visible={reloadToastVisible}
          fileName={selectedPdf?.fileName ?? null}
        />

        <AmbientReloadIndicator
          label={reloadAgoLabel}
          bottomOffset={ambientBottomOffset}
          tone={
            statusTone === "error"
              ? "error"
              : statusTone === "live"
                ? "live"
                : "idle"
          }
        />

        <HookDock
          visible={Boolean(currentHistoryEntry)}
          hooks={currentHistoryEntry?.hooks ?? []}
          hookStatuses={hookStatuses}
          expanded={hookDockExpanded}
          onToggleExpanded={handleToggleHookDock}
          onToggleHook={handleToggleHook}
          onAddHook={handleAddHook}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      <SettingsSheet
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedPdf={
          selectedPdf
            ? { path: selectedPdf.path, fileName: selectedPdf.fileName }
            : null
        }
        pathInput={pathInput}
        onPathInputChange={setPathInput}
        onPickPdf={handleSelectPdf}
        onPathSubmit={handlePathSubmit}
        isPicking={isPicking}
        isWatchingPath={isWatchingPath}
        watchHistory={watchHistory}
        historyStatuses={historyStatuses}
        isCheckingHistory={isCheckingHistory}
        historyError={historyError}
        onSelectHistory={(path) => void handleSelectHistoryEntry(path)}
        onRemoveHistory={(path) => void handleRemoveHistoryEntry(path)}
        currentHistoryEntry={currentHistoryEntry}
        templateCandidates={templateCandidates}
        copySourcePath={copySourcePath}
        onCopySourceChange={setCopySourcePath}
        onCopyHooks={handleCopyHooksFromTemplate}
        onAddHook={handleAddHook}
        onUpdateHook={handleUpdateHook}
        onRemoveHook={handleRemoveHook}
        onToggleHook={handleToggleHook}
        hookStatuses={hookStatuses}
        hookPathStatuses={hookPathStatuses}
        nowMs={tickNow}
        updateCheckerSlot={isTauriClient ? <UpdateChecker /> : null}
      />

      <span aria-live="polite" className="rtpdf-sr-only">
        {statusText}
      </span>
    </main>
  );
}
